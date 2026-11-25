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
    <a class="logo" href="#/">SHOP THE LOOK</a>
    <nav class="nav">
      <button class="link" id="reset" hidden>NEW LOOK</button>
      <a class="nav-link" href="#/shop" data-route="shop">SHOP</a>
      <a class="nav-link" href="#/about" data-route="about">ABOUT</a>
    </nav>
  </header>
  <main>
    <section class="page home" data-page="home">
      <div class="hero">
        <p class="label">AI PERSONAL SHOPPER</p>
        <h1 class="headline">See it. Shop it.</h1>
        <p class="muted lead">Upload any outfit photo and get every piece, priced, with a link to buy.</p>
        <a class="btn" href="#/shop">UPLOAD A LOOK</a>
      </div>
      <ol class="steps">
        <li><span class="cat">01</span><p>Upload an inspo photo or a model wearing the fit</p></li>
        <li><span class="cat">02</span><p>Every item is identified, top to bottom</p></li>
        <li><span class="cat">03</span><p>Get prices, retailers and links to shop</p></li>
      </ol>
    </section>

    <section class="page about" data-page="about" hidden>
      <p class="label">ABOUT</p>
      <h1 class="headline">Shop The Look</h1>
      <p>Found an outfit you love on social media, in a magazine or on the street? Shop The Look turns that picture into a shopping list.</p>
      <p>Upload a photo and the app identifies each visible piece: outerwear, tops, bottoms, shoes, bags and accessories. It then searches online retailers for each one. When the brand can be recognized it finds the exact product; otherwise it finds the closest similar piece.</p>
      <p>Each item comes with its price, the retailer and a link to buy, plus a total for the whole look.</p>
      <p class="hint">Prices come from retailer listings found online and may change. Your photo is only used to analyze the look; the app does not save it.</p>
      <a class="btn" href="#/shop">TRY IT</a>
    </section>

    <section class="page" data-page="shop" id="view" hidden></section>
  </main>
  <input type="file" id="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
`;

const view = app.querySelector<HTMLElement>("#view")!;
const fileInput = app.querySelector<HTMLInputElement>("#file")!;
const resetBtn = app.querySelector<HTMLButtonElement>("#reset")!;

type Route = "home" | "shop" | "about";
let route: Route = "home";

let busy = false;
let hasLook = false; // a look is loading or shown in the shop view
let run = 0; // bumps on every new look, so stale responses are ignored

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
  hasLook = false;
  run++;
  updateReset();
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
  hasLook = true;
  const id = ++run;
  updateReset();

  let image: string;
  try {
    image = await toDataUrl(file);
  } catch {
    if (id !== run) return;
    busy = false;
    showLayout("", errorPanel("This image couldn't be read."));
    bindRetry();
    return;
  }

  if (id !== run) return;
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

  if (id !== run) return;
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
  if (route !== "shop") return;
  const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
  if (file) start(file);
});

resetBtn.addEventListener("click", showUpload);

function updateReset() {
  resetBtn.hidden = !(route === "shop" && hasLook);
}

function render() {
  const hash = location.hash.replace(/^#\/?/, "");
  route = hash === "shop" || hash === "about" ? hash : "home";
  app.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
    el.hidden = el.dataset.page !== route;
  });
  app.querySelectorAll<HTMLElement>("[data-route]").forEach((el) => {
    el.classList.toggle("active", el.dataset.route === route);
  });
  updateReset();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);

showUpload();
render();
