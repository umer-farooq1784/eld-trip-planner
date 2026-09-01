/**
 * Rasterise a log sheet to PNG. Font custom properties do not survive
 * serialisation, so they are re-declared inside the SVG.
 */

const FONT_DECLARATIONS = `
  <style>
    text {
      --font-sans: "Public Sans", Arial, sans-serif;
      --font-mono: "IBM Plex Mono", monospace;
      --font-display: "Archivo", Arial, sans-serif;
    }
  </style>`;

export async function downloadSheetPng(svg: SVGSVGElement, filename: string, scale = 2) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.insertAdjacentHTML("afterbegin", FONT_DECLARATIONS);

  const [, , width, height] = (clone.getAttribute("viewBox") ?? "0 0 1000 940")
    .split(" ")
    .map(Number);

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render the sheet."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render the sheet.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not render the sheet.");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
