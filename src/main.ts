import "./style.css";

interface LookItem {
  category: string;
  name: string;
  description: string;
  color: string;
  brand: string;
  match: "exact" | "similar";
  price: number;
  currency: string;
  retailer: string;
  url: string;
}

interface Look {
  summary: string;
  currency: string;
  total: number;
  items: LookItem[];
}

const MAX_SIDE = 1568;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="bar">
    <span class="logo">SHOP THE LOOK</span>
    <button class="link" id="reset" hidden>NEW LOOK</button>
  </header>
  <main id="view"></main>
  <input type="file" id="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
`;

const view = app.querySelector<HTMLElement>("#view")!;
const fileInput = app.querySelector<HTMLInputElement>("#file")!;
const resetBtn = app.querySelector<HTMLButtonElement>("#reset")!;

let busy = false;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function showUpload() {
  busy = false;
  resetBtn.hidden = true;
  view.innerHTML = `
    <section class="upload" id="drop" tabindex="0" role="button" aria-label="Upload a photo">
      <p class="label">UPLOAD A LOOK</p>
      <p class="muted">Drop an inspo photo here, paste it, or click to choose</p>
      <p class="hint">JPEG · PNG · WEBP</p>
    </section>
  `;
  const drop = view.querySelector<HTMLElement>("#drop")!;
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const file = e.dataTransfer?.files[0];
    if (file) start(file);
  });
}

function showLayout(imageUrl: string, panel: string) {
  view.innerHTML = `
    <section class="look">
      ${imageUrl ? `<figure class="photo"><img src="${imageUrl}" alt="Uploaded look" /></figure>` : ""}
      <div class="panel">${panel}</div>
    </section>
  `;
}

function loadingPanel(): string {
  return `
    <p class="label">ANALYZING LOOK</p>
    <div class="progress"><span></span></div>
    <p class="muted">Identifying each piece and finding where to buy it. This can take a minute.</p>
  `;
}

function errorPanel(message: string): string {
  return `
    <p class="label">SOMETHING WENT WRONG</p>
    <p class="muted">${esc(message)}</p>
    <button class="btn" id="retry">TRY ANOTHER PHOTO</button>
  `;
}

function resultPanel(look: Look): string {
  if (look.items.length === 0) {
    return `
      <p class="label">NO ITEMS FOUND</p>
      <p class="muted">We couldn't spot any clothing in this photo. Try one with a clearer view of the outfit.</p>
    `;
  }
  const rows = look.items
    .map((item) => {
      const url = safeUrl(item.url);
      const meta = [item.brand, item.color].filter(Boolean).map(esc).join(" · ");
      return `
        <li class="item">
          <div class="item-top">
            <span class="cat">${esc(item.category.toUpperCase())}</span>
            <span class="tag ${item.match}">${item.match === "exact" ? "EXACT" : "SIMILAR"}</span>
          </div>
          <div class="item-main">
            <div>
              <p class="name">${esc(item.name)}</p>
              <p class="muted">${meta}</p>
            </div>
            <p class="price">${money(item.price, item.currency || look.currency)}</p>
          </div>
          <div class="item-foot">
            <span class="muted">${esc(item.retailer)}</span>
            ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">VIEW</a>` : ""}
          </div>
        </li>`;
    })
    .join("");

  return `
    <p class="label">${look.items.length} ITEMS</p>
    <p class="muted summary">${esc(look.summary)}</p>
    <ul class="items">${rows}</ul>
    <div class="total">
      <span>TOTAL</span>
      <span>${money(look.total, look.currency)}</span>
    </div>
    <p class="hint">Prices come from retailer listings found online and may change.</p>
  `;
}

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function start(file: File) {
  if (busy) return;
  if (!file.type.startsWith("image/")) {
    alert("Please choose an image file.");
    return;
  }
  busy = true;
  resetBtn.hidden = false;

  let image: string;
  try {
    image = await toDataUrl(file);
  } catch {
    busy = false;
    showLayout("", errorPanel("This image couldn't be read."));
    bindRetry();
    return;
  }

  showLayout(image, loadingPanel());

  let panel: string;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected response from server." }));
    panel = res.ok ? resultPanel(data as Look) : errorPanel(data.error ?? "Request failed.");
  } catch {
    panel = errorPanel("Network error. Check your connection and try again.");
  }

  busy = false;
  const target = view.querySelector<HTMLElement>(".panel");
  if (target) target.innerHTML = panel;
  bindRetry();
}

function bindRetry() {
  view.querySelector("#retry")?.addEventListener("click", () => {
    showUpload();
    fileInput.click();
  });
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (file) start(file);
});

document.addEventListener("paste", (e) => {
  const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
  if (file) start(file);
});

resetBtn.addEventListener("click", showUpload);

showUpload();
