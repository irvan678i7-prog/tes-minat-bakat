// Run with Node >= 22.13:
// node --experimental-vm-modules --test tests/cfit-redeem.test.mjs
// Executes the actual route source with mocked Next.js/Prisma/auth services.
// No database, network request, or production credentials are used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { z } from "zod";

const routeUrl = new URL("../src/app/api/cfit/redeem/route.ts", import.meta.url);
const source = stripTypeScriptTypes(readFileSync(routeUrl, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

async function setup(options = {}) {
  const token = {
    id: "token-cfit-test",
    code: "TEST-CFIT",
    form: "FORM_3AB",
    school: "Sekolah Uji",
    grade: "X",
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    redeemedAt: null,
    ...options.token,
  };
  const oldSubmission = options.submission ?? null;
  const calls = {
    tokenReads: [], submissionReads: [], creates: [], tokenUpdates: [],
    resumePicks: 0, signed: [], cookies: [], logs: [],
  };
  const prisma = {
    cfitAccessToken: {
      findUnique: async (args) => {
        calls.tokenReads.push(clone(args));
        return options.missingToken ? null : token;
      },
      updateMany: async (args) => {
        calls.tokenUpdates.push(clone(args));
        return { count: 1 };
      },
    },
    cfitSubmission: {
      findUnique: async (args) => {
        calls.submissionReads.push(clone(args));
        return oldSubmission;
      },
      create: async ({ data }) => {
        calls.creates.push(clone(data));
        if (options.failCreateWithResume && data.resumeCode) {
          throw new Error("Simulated unavailable resume-code column");
        }
        return { id: "submission-new", fullName: null, finishedAt: null, ...data };
      },
    },
  };
  const dependencies = {
    "next/server": {
      NextRequest: class {},
      NextResponse: {
        json: (body, init = {}) => ({
          body,
          status: init.status ?? 200,
          headers: init.headers ?? {},
          cookies: { set: (...args) => calls.cookies.push(clone(args)) },
        }),
      },
    },
    zod: { z },
    crypto: { randomUUID: () => "seed-test" },
    "@/lib/db": { prisma },
    "@/lib/rate-limit": {
      getClientIp: () => "127.0.0.1",
      rateLimit: () => ({ ok: !options.rateLimited, resetAt: Date.now() + 60000 }),
    },
    "@/lib/env": { STUDENT_JWT_EXPIRES_IN: "8h" },
    "@/lib/cfit/auth": {
      CFIT_COOKIE: "tmb_cfit",
      expiresInToSeconds: () => 28800,
      getCfitFromRequest: () => options.cookie ?? null,
      signCfitToken: (payload) => {
        calls.signed.push(clone(payload));
        return "test-jwt";
      },
    },
    "@/lib/cfit/resume": {
      pickFreeCfitResumeCode: async () => {
        calls.resumePicks += 1;
        if (options.failResumePick) throw new Error("Simulated resume-code failure");
        return "TEST-01";
      },
    },
  };
  const context = createContext({
    Date,
    process: { env: { NODE_ENV: "test" } },
    console: {
      warn: (...args) => calls.logs.push(args),
      error: (...args) => calls.logs.push(args),
    },
  });
  const module = new SourceTextModule(source, { context, identifier: routeUrl.href });
  await module.link((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected import: ${specifier}`);
    const exports = dependencies[specifier];
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return {
    calls,
    token,
    post: (body = { code: "TEST-CFIT" }) => module.namespace.POST({
      json: async () => body,
    }),
  };
}

function oldSession(form, overrides = {}) {
  return {
    id: "submission-old", tokenId: "token-cfit-test", form,
    fullName: "Peserta Lama", finishedAt: null,
    ...overrides,
  };
}

const cookie = { sub: "submission-old", tokenId: "token-cfit-test" };

function noWrites(calls) {
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.tokenUpdates.length, 0);
  assert.equal(calls.resumePicks, 0);
}

function blockedWithoutSideEffects(response, calls) {
  assert.equal(response.status, 410);
  assert.match(response.body.error, /3A \+ 3B/);
  noWrites(calls);
  assert.equal(calls.signed.length, 0);
  assert.equal(calls.cookies.length, 0);
}

for (const form of ["FORM_3A", "FORM_3B"]) {
  test(`${form}: token satu bentuk tidak dapat membuat sesi baru`, async () => {
    const { post, calls } = await setup({ token: { form } });
    blockedWithoutSideEffects(await post(), calls);
  });

  test(`${form}: forceNew tidak melewati pembatasan`, async () => {
    const { post, calls } = await setup({ token: { form }, cookie, submission: oldSession(form) });
    blockedWithoutSideEffects(await post({ code: "TEST-CFIT", forceNew: true }), calls);
    assert.equal(calls.submissionReads.length, 0);
  });

  for (const expired of [false, true]) {
    test(`${form}: sesi lama tetap dilanjutkan (token expired=${expired})`, async () => {
      const submission = oldSession(form);
      const original = clone(submission);
      const { post, calls } = await setup({
        token: { form, ...(expired ? { expiresAt: new Date("2000-01-01") } : {}) },
        cookie, submission,
      });
      const response = await post();
      assert.equal(response.status, 200);
      assert.equal(response.body.submissionId, "submission-old");
      assert.equal(response.body.form, form);
      assert.equal(calls.signed[0].sub, "submission-old");
      assert.equal(calls.signed[0].form, form);
      assert.equal(calls.cookies[0][0], "tmb_cfit");
      noWrites(calls);
      assert.deepEqual(submission, original);
    });
  }

  test(`${form}: cookie dengan sesi yang hilang tidak membuat sesi pengganti`, async () => {
    const { post, calls } = await setup({ token: { form }, cookie });
    blockedWithoutSideEffects(await post(), calls);
  });

  test(`${form}: cookie token lain tidak dapat digunakan untuk melewati pembatasan`, async () => {
    const { post, calls } = await setup({
      token: { form }, cookie: { ...cookie, tokenId: "another-token" },
      submission: oldSession(form),
    });
    blockedWithoutSideEffects(await post(), calls);
    assert.equal(calls.submissionReads.length, 0);
  });

  test(`${form}: hasil lookup sesi milik token lain ditolak`, async () => {
    const { post, calls } = await setup({
      token: { form }, cookie,
      submission: oldSession(form, { tokenId: "another-token" }),
    });
    blockedWithoutSideEffects(await post(), calls);
  });

  test(`${form}: hasil sesi yang sudah selesai tetap dapat dibaca tanpa ditulis ulang`, async () => {
    const { post, calls } = await setup({
      token: { form }, cookie,
      submission: oldSession(form, { finishedAt: new Date("2026-01-01") }),
    });
    const response = await post();
    assert.equal(response.status, 200);
    assert.ok(response.body.finishedAt);
    noWrites(calls);
  });
}

test("3A+3B: sesi baru dibuat dengan kode lanjut dan identitas token", async () => {
  const { post, calls } = await setup();
  const response = await post({ code: " test-cfit " });
  assert.equal(response.status, 200);
  assert.equal(response.body.form, "FORM_3AB");
  assert.equal(calls.tokenReads[0].where.code, "TEST-CFIT");
  assert.deepEqual(calls.creates, [{
    tokenId: "token-cfit-test", form: "FORM_3AB", school: "Sekolah Uji",
    grade: "X", randomSeed: "seed-test", resumeCode: "TEST-01",
  }]);
  assert.equal(calls.tokenUpdates.length, 1);
  assert.equal(calls.cookies.length, 1);
});

test("3A+3B: forceNew tetap membuat sesi peserta berikutnya", async () => {
  const { post, calls } = await setup({ cookie, submission: oldSession("FORM_3AB") });
  const response = await post({ code: "TEST-CFIT", forceNew: true });
  assert.equal(response.status, 200);
  assert.equal(response.body.submissionId, "submission-new");
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.submissionReads.length, 0);
});

test("3A+3B: token kedaluwarsa tetap menolak sesi baru", async () => {
  const { post, calls } = await setup({ token: { expiresAt: new Date("2000-01-01") } });
  const response = await post();
  assert.equal(response.status, 410);
  assert.match(response.body.error, /kadaluarsa/);
  noWrites(calls);
});

test("3A+3B: token kedaluwarsa tetap mengizinkan resume sesi lama", async () => {
  const { post, calls } = await setup({
    token: { expiresAt: new Date("2000-01-01") }, cookie, submission: oldSession("FORM_3AB"),
  });
  assert.equal((await post()).status, 200);
  noWrites(calls);
});

test("3A+3B: kegagalan pencarian kode lanjut tidak memblokir sesi baru", async () => {
  const { post, calls } = await setup({ failResumePick: true });
  assert.equal((await post()).status, 200);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].form, "FORM_3AB");
  assert.equal(calls.creates[0].resumeCode, undefined);
});

test("3A+3B: kegagalan menyimpan kode lanjut memakai fallback yang sudah ada", async () => {
  const { post, calls } = await setup({ failCreateWithResume: true });
  assert.equal((await post()).status, 200);
  assert.equal(calls.creates.length, 2);
  assert.ok(calls.creates[0].resumeCode);
  assert.equal(calls.creates[1].resumeCode, undefined);
  assert.ok(calls.creates.every((data) => data.form === "FORM_3AB"));
});

test("3A+3B: token yang sudah diredeem tidak distempel ulang", async () => {
  const { post, calls } = await setup({ token: { redeemedAt: new Date("2026-01-01") } });
  assert.equal((await post()).status, 200);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.tokenUpdates.length, 0);
});

test("Validasi input tetap menolak request tanpa kode", async () => {
  const { post, calls } = await setup();
  assert.equal((await post({})).status, 400);
  assert.equal(calls.tokenReads.length, 0);
  noWrites(calls);
});

test("Token yang tidak ditemukan tetap menghasilkan 404", async () => {
  const { post, calls } = await setup({ missingToken: true });
  assert.equal((await post()).status, 404);
  noWrites(calls);
});

test("Pembatasan jumlah percobaan tetap menghasilkan 429", async () => {
  const { post, calls } = await setup({ rateLimited: true });
  const response = await post();
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers["Retry-After"]) > 0);
  assert.equal(calls.tokenReads.length, 0);
  noWrites(calls);
});
