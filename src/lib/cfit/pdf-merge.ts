// Gabungkan beberapa PDF (rekap + laporan individu) jadi satu dokumen dengan
// nomor halaman BERLANJUT. Pola sama dengan api/admin/rekap-full minat-bakat.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function mergeCfitPdfs(buffers: Buffer[]): Promise<Uint8Array> {
	const merged = await PDFDocument.create();
	for (const buf of buffers) {
		const doc = await PDFDocument.load(buf);
		(await merged.copyPages(doc, doc.getPageIndices())).forEach((p) => merged.addPage(p));
	}

	// Nomor halaman menyambung di seluruh dokumen.
	// - Halaman rekap = landscape, ada bar hitam di bawah -> tulis putih.
	// - Halaman individu = portrait, background putih -> tulis gelap.
	const font = await merged.embedFont(StandardFonts.HelveticaBold);
	const total = merged.getPageCount();
	merged.getPages().forEach((page, i) => {
		const { width, height } = page.getSize();
		const isLandscape = width > height;
		const label = `Hal ${i + 1} / ${total}`;
		const size = 9;
		const tw = font.widthOfTextAtSize(label, size);
		if (isLandscape) {
			page.drawRectangle({ x: width - 180, y: 0, width: 180, height: 22, color: rgb(0, 0, 0) });
			page.drawText(label, { x: width - 36 - tw, y: 7, size, font, color: rgb(1, 1, 1) });
		} else {
			page.drawRectangle({ x: width - 130, y: 5, width: 110, height: 18, color: rgb(1, 1, 1) });
			page.drawText(label, {
				x: width - 28 - tw,
				y: 8,
				size,
				font,
				color: rgb(0.06, 0.09, 0.16),
			});
		}
	});
	return merged.save();
}
