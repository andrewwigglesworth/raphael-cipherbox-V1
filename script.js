/* ==========================================================================
   Raphael CipherBox — shared browser application logic
   All utilities run locally. No inputs are transmitted to a server.
   ========================================================================== */

"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HISTORY_KEY = "raphael-cipherbox-history";

/* --------------------------------------------------------------------------
   Shared interface: navigation, buttons, dates, and feedback
   -------------------------------------------------------------------------- */

function initSharedUI() {
  const page = document.body.dataset.page;
  const activeLink = $(`[data-nav="${page}"]`);
  if (activeLink) {
    activeLink.classList.add("active");
    activeLink.setAttribute("aria-current", "page");
  }

  const toggle = $(".menu-toggle");
  const nav = $(".nav-links");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  $$("[data-year]").forEach((element) => { element.textContent = new Date().getFullYear(); });

  $$("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => copyText($("#" + button.dataset.copy)?.value || $("#" + button.dataset.copy)?.textContent));
  });

  $$(".reveal-key").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $("#" + button.dataset.target);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show key" : "Hide key";
    });
  });

  $$("[data-clear-group]").forEach((button) => {
    button.addEventListener("click", () => clearGroup(button.dataset.clearGroup));
  });
}

function showToast(message, type = "success") {
  const region = $(".toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 3200);
}

async function copyText(text) {
  if (!text) return showToast("There is no output to copy.", "error");
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard.");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast("Copied to clipboard.");
  }
}

function clearGroup(group) {
  const selectors = {
    aes: ["#aes-input", "#aes-key", "#aes-output"],
    legacy: ["#legacy-input", "#legacy-key", "#legacy-raw", "#legacy-output"],
    jwt: ["#jwt-input"]
  };
  (selectors[group] || []).forEach((selector) => { const item = $(selector); if (item) item.value = ""; });
  if (group === "jwt") {
    ["#jwt-header", "#jwt-payload", "#jwt-signature"].forEach((selector) => { const item = $(selector); if (item) item.textContent = "Waiting for a token…"; });
    const error = $("#jwt-error"); if (error) error.hidden = true;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function utf8ToBase64(value) { return bytesToBase64(encoder.encode(value)); }
function base64ToUtf8(value) { return decoder.decode(base64ToBytes(value)); }

/* --------------------------------------------------------------------------
   Local history
   -------------------------------------------------------------------------- */

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(tool, action, input, output) {
  if (!output) return showToast("Create an output before saving.", "error");
  const history = getHistory();
  history.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    tool, action, input, output, timestamp: new Date().toISOString()
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  showToast("Saved to local history.");
}

/* --------------------------------------------------------------------------
   Encoders and decoders
   -------------------------------------------------------------------------- */

const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
  5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", ".": ".-.-.-",
  ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.", "@": ".--.-."
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([key, value]) => [value, key]));

const encoderTools = [
  {
    id: "base64", name: "Base64", tag: "Data transport",
    description: "Represent binary or text data with a portable 64-character alphabet.",
    encode: utf8ToBase64, decode: base64ToUtf8,
    uses: "Email attachments, data URLs, basic HTTP credentials, and inspecting encoded payloads.",
    limits: "Base64 is not encryption. Anyone can reverse it without a key.", sample: "hello → aGVsbG8="
  },
  {
    id: "url", name: "URL", tag: "Web",
    description: "Escape characters so text can safely appear in URL components.",
    encode: encodeURIComponent, decode: decodeURIComponent,
    uses: "Query parameters, redirects, web testing, and understanding percent-encoded requests.",
    limits: "URL encoding provides compatibility, not secrecy or input sanitization.", sample: "hello world → hello%20world"
  },
  {
    id: "hex", name: "Hexadecimal", tag: "Byte representation",
    description: "Represent each UTF-8 byte using two base-16 characters.",
    encode: (value) => [...encoder.encode(value)].map((byte) => byte.toString(16).padStart(2, "0")).join(" "),
    decode: (value) => decoder.decode(Uint8Array.from(value.trim().split(/[\s,:-]+/).filter(Boolean), (part) => {
      if (!/^[0-9a-f]{2}$/i.test(part)) throw new Error("Use two-digit hexadecimal bytes, such as 48 65 6c 6c 6f.");
      return parseInt(part, 16);
    })),
    uses: "Packet inspection, file signatures, shellcode analysis, and low-level debugging.",
    limits: "Hex doubles the storage size and does not hide the original data.", sample: "Hi → 48 69"
  },
  {
    id: "binary", name: "Binary", tag: "Bits",
    description: "Display text as groups of eight binary digits per UTF-8 byte.",
    encode: (value) => [...encoder.encode(value)].map((byte) => byte.toString(2).padStart(8, "0")).join(" "),
    decode: (value) => decoder.decode(Uint8Array.from(value.trim().split(/\s+/).filter(Boolean), (part) => {
      if (!/^[01]{8}$/.test(part)) throw new Error("Use 8-bit groups separated by spaces.");
      return parseInt(part, 2);
    })),
    uses: "Learning bit-level representations, protocol fields, and simple CTF puzzles.",
    limits: "Binary is verbose and is only a representation of the underlying bytes.", sample: "A → 01000001"
  },
  {
    id: "ascii", name: "ASCII codes", tag: "Character codes",
    description: "Convert basic text to decimal character code values.",
    encode: (value) => [...value].map((char) => {
      const code = char.codePointAt(0);
      if (code > 127) throw new Error("ASCII only supports character codes 0–127.");
      return code;
    }).join(" "),
    decode: (value) => value.trim().split(/[\s,]+/).filter(Boolean).map((part) => {
      const code = Number(part);
      if (!Number.isInteger(code) || code < 0 || code > 127) throw new Error("Enter decimal ASCII values from 0 to 127.");
      return String.fromCharCode(code);
    }).join(""),
    uses: "Reading protocol values, simple obfuscation, and foundational character encoding exercises.",
    limits: "ASCII contains only 128 characters and cannot represent most world languages.", sample: "Hi → 72 105"
  },
  {
    id: "html", name: "HTML entities", tag: "Web",
    description: "Represent reserved HTML characters with named or numeric entities.",
    encode: (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]),
    decode: (value) => { const area = document.createElement("textarea"); area.innerHTML = value; return area.value; },
    uses: "Displaying markup as text and understanding browser rendering behavior.",
    limits: "Entity encoding for display is not a universal XSS defense; use context-aware output encoding.", sample: "<b> → &lt;b&gt;"
  },
  {
    id: "unicode", name: "Unicode escapes", tag: "International text",
    description: "Convert characters to JavaScript-style Unicode code point escapes.",
    encode: (value) => [...value].map((char) => `\\u{${char.codePointAt(0).toString(16).toUpperCase()}}`).join(""),
    decode: (value) => value.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (_, braced, short) => String.fromCodePoint(parseInt(braced || short, 16))),
    uses: "Malware analysis, source-code inspection, text normalization research, and escaped payload review.",
    limits: "Visual similarity and normalization can make Unicode security analysis more complex.", sample: "✓ → \\u{2713}"
  },
  {
    id: "morse", name: "Morse code", tag: "Classic encoding",
    description: "Translate letters and numbers into dots and dashes.",
    encode: (value) => value.toUpperCase().split("").map((char) => char === " " ? "/" : (MORSE[char] || "?")).join(" "),
    decode: (value) => value.trim().split(/\s+/).map((code) => code === "/" ? " " : (MORSE_REVERSE[code] || "?")).join(""),
    uses: "Beginner puzzles, signal history, and pattern-recognition exercises.",
    limits: "Morse code is not a cryptographic system and punctuation support varies.", sample: "SOS → ... --- ..."
  },
  {
    id: "rot13", name: "ROT13", tag: "Substitution",
    description: "Rotate each Latin letter by 13 positions. Applying ROT13 twice restores the text.",
    encode: rot13, decode: rot13,
    uses: "Spoiler hiding, basic CTF challenges, and recognizing weak text obfuscation.",
    limits: "There is no key and no security; ROT13 is instantly reversible.", sample: "hello → uryyb"
  },
  {
    id: "caesar", name: "Caesar cipher", tag: "Classic cipher", shift: true,
    description: "Shift Latin letters by a customizable number of alphabet positions.",
    encode: (value, shift) => caesar(value, shift), decode: (value, shift) => caesar(value, -shift),
    uses: "Learning substitution ciphers, frequency analysis, and introductory cryptanalysis.",
    limits: "Only 25 meaningful shifts exist, so brute-force recovery is trivial.", sample: "hello with shift 3 → khoor"
  },
  {
    id: "reverse", name: "Reverse text", tag: "Text utility",
    description: "Reverse visible Unicode characters in a string.",
    encode: (value) => [...value].reverse().join(""), decode: (value) => [...value].reverse().join(""),
    uses: "Quick transformations, puzzle solving, and identifying simplistic obfuscation.",
    limits: "Complex combined Unicode characters may not reverse as a reader expects.", sample: "cipher → rehpic"
  }
];

function rot13(value) { return value.replace(/[a-z]/gi, (char) => String.fromCharCode((char.charCodeAt(0) <= 90 ? 65 : 97) + (char.charCodeAt(0) - (char.charCodeAt(0) <= 90 ? 65 : 97) + 13) % 26)); }
function caesar(value, shift = 3) {
  const amount = ((Number(shift) % 26) + 26) % 26;
  return value.replace(/[a-z]/gi, (char) => {
    const start = char === char.toUpperCase() ? 65 : 97;
    return String.fromCharCode(start + (char.charCodeAt(0) - start + amount) % 26);
  });
}

function initEncoders() {
  const container = $("#encoder-tools");
  if (!container) return;

  container.innerHTML = encoderTools.map((tool) => `
    <article class="tool-card card encoder-card" id="${tool.id}" data-tool-name="${tool.name.toLowerCase()}">
      <div class="tool-card-header">
        <div><span class="badge badge-blue">${tool.tag}</span><h2>${tool.name}</h2><p>${tool.description}</p></div>
        <span class="tool-icon blue" aria-hidden="true">${tool.id === "base64" ? "64" : "↔"}</span>
      </div>
      ${tool.shift ? `<div class="encoder-extra"><div class="field"><label for="${tool.id}-shift">Shift value</label><input id="${tool.id}-shift" type="number" min="-25" max="25" value="3"></div></div>` : ""}
      <div class="form-grid">
        <div class="field"><label for="${tool.id}-input">Input</label><textarea id="${tool.id}-input" rows="5" placeholder="Enter text"></textarea></div>
        <div class="field"><label for="${tool.id}-output">Output</label><textarea id="${tool.id}-output" rows="5" readonly placeholder="Result appears here"></textarea></div>
      </div>
      <div class="button-row">
        <button class="button button-primary" data-encoder-action="encode" data-tool="${tool.id}">Encode</button>
        <button class="button button-secondary" data-encoder-action="decode" data-tool="${tool.id}">Decode</button>
        <button class="button button-ghost" data-encoder-action="copy" data-tool="${tool.id}">Copy output</button>
        <button class="button button-ghost" data-encoder-action="clear" data-tool="${tool.id}">Clear</button>
        <button class="button button-ghost" data-encoder-action="save" data-tool="${tool.id}">Save to history</button>
      </div>
      <details class="explanation"><summary>Learn about ${tool.name}</summary><div>
        <p><strong>Common security uses:</strong> ${tool.uses}</p>
        <p><strong>Limitations:</strong> ${tool.limits}</p>
        <p><strong>Sample:</strong> <code>${escapeHtml(tool.sample)}</code></p>
      </div></details>
    </article>`).join("");

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-encoder-action]");
    if (!button) return;
    runEncoderAction(button.dataset.tool, button.dataset.encoderAction);
  });

  const filter = $("#encoder-filter");
  const count = $("#tool-count");
  const applyFilter = () => {
    const query = filter.value.trim().toLowerCase();
    let visible = 0;
    $$(".encoder-card").forEach((card) => {
      const match = card.textContent.toLowerCase().includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    });
    count.textContent = `${visible} tool${visible === 1 ? "" : "s"}`;
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
}

function runEncoderAction(id, action) {
  const tool = encoderTools.find((item) => item.id === id);
  const input = $(`#${id}-input`);
  const output = $(`#${id}-output`);
  const shift = $(`#${id}-shift`)?.value || 3;
  if (!tool || !input || !output) return;

  if (action === "copy") return copyText(output.value);
  if (action === "clear") { input.value = ""; output.value = ""; return; }
  if (action === "save") return saveHistory(tool.name, output.dataset.lastAction || "Convert", input.value, output.value);
  if (!input.value) return showToast("Enter some input first.", "error");

  try {
    output.value = action === "encode" ? tool.encode(input.value, shift) : tool.decode(input.value, shift);
    output.dataset.lastAction = action === "encode" ? "Encode" : "Decode";
  } catch (error) {
    showToast(error.message || `Could not ${action} that value.`, "error");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/* --------------------------------------------------------------------------
   Encryption: AES-GCM plus explicitly educational legacy simulations
   -------------------------------------------------------------------------- */

async function deriveAesKey(password, salt, usage) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, usage
  );
}

async function aesEncrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
  return JSON.stringify({ v: 1, alg: "AES-256-GCM", salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) });
}

async function aesDecrypt(packageText, password) {
  const payload = JSON.parse(packageText);
  if (payload.alg !== "AES-256-GCM" || !payload.salt || !payload.iv || !payload.data) throw new Error("This is not a valid CipherBox AES package.");
  const key = await deriveAesKey(password, base64ToBytes(payload.salt), ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
  return decoder.decode(plaintext);
}

function xorBytes(data, key) {
  const keyBytes = encoder.encode(key);
  if (!keyBytes.length) throw new Error("Enter a key.");
  return Uint8Array.from(data, (byte, index) => byte ^ keyBytes[index % keyBytes.length]);
}

// A reversible Feistel construction for learning only. It is intentionally not DES.
function educationalFeistel(data, key, decrypting = false, triple = false) {
  const rounds = triple ? 48 : 16;
  const keyBytes = encoder.encode(key);
  if (!keyBytes.length) throw new Error("Enter a key.");
  let originalLength;
  let body;
  if (decrypting) {
    if (data.length < 2) throw new Error("The encrypted value is incomplete.");
    originalLength = (data[0] << 8) | data[1];
    body = data.slice(2);
  } else {
    originalLength = data.length;
    body = new Uint8Array(Math.ceil(data.length / 2) * 2);
    body.set(data);
  }
  for (let pair = 0; pair < body.length; pair += 2) {
    let left = body[pair], right = body[pair + 1];
    const sequence = [...Array(rounds).keys()];
    if (decrypting) sequence.reverse();
    sequence.forEach((round) => {
      if (!decrypting) {
        const next = left ^ ((right + keyBytes[round % keyBytes.length] + round * 17) & 255);
        left = right; right = next;
      } else {
        const previousRight = left;
        const previousLeft = right ^ ((left + keyBytes[round % keyBytes.length] + round * 17) & 255);
        left = previousLeft; right = previousRight;
      }
    });
    body[pair] = left; body[pair + 1] = right;
  }
  const result = new Uint8Array(body.length + 2);
  result[0] = (originalLength >>> 8) & 255; result[1] = originalLength & 255; result.set(body, 2);
  if (decrypting) return result.slice(2, 2 + originalLength);
  return result;
}

function initEncryption() {
  if (!$("#aes-encrypt")) return;
  let aesAction = "";
  let legacyAction = "";

  $("#aes-encrypt").addEventListener("click", async () => {
    const input = $("#aes-input").value, key = $("#aes-key").value;
    if (!input || !key) return showToast("Enter plaintext and a secret key.", "error");
    try {
      $("#aes-output").value = await aesEncrypt(input, key);
      aesAction = "Encrypt";
      showToast("AES-GCM encryption complete.");
    } catch { showToast("AES encryption failed in this browser.", "error"); }
  });

  $("#aes-decrypt").addEventListener("click", async () => {
    const input = $("#aes-input").value, key = $("#aes-key").value;
    if (!input || !key) return showToast("Paste an encrypted package and enter its key.", "error");
    try {
      $("#aes-output").value = await aesDecrypt(input, key);
      aesAction = "Decrypt";
      showToast("AES-GCM decryption complete.");
    } catch { showToast("Decryption failed. Check the package and passphrase.", "error"); }
  });

  $("#aes-save").addEventListener("click", () => saveHistory("AES-GCM", aesAction || "Encrypt", $("#aes-input").value, $("#aes-output").value));

  const runLegacy = (decrypting) => {
    const algorithm = $("#legacy-algorithm").value;
    const input = $("#legacy-input").value;
    const key = $("#legacy-key").value;
    if (!input || !key) return showToast("Enter input and a custom key.", "error");
    try {
      let result;
      if (algorithm === "xor") {
        result = xorBytes(decrypting ? base64ToBytes(input) : encoder.encode(input), key);
      } else {
        result = educationalFeistel(decrypting ? base64ToBytes(input) : encoder.encode(input), key, decrypting, algorithm === "3des");
      }
      $("#legacy-output").value = decrypting ? decoder.decode(result) : bytesToBase64(result);
      $("#legacy-raw").value = decrypting ? decoder.decode(result) : [...result].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
      legacyAction = decrypting ? "Decrypt" : "Encrypt";
    } catch (error) { showToast(error.message || "The transformation failed.", "error"); }
  };

  $("#legacy-encrypt").addEventListener("click", () => runLegacy(false));
  $("#legacy-decrypt").addEventListener("click", () => runLegacy(true));
  $("#legacy-save").addEventListener("click", () => saveHistory($("#legacy-algorithm").selectedOptions[0].text, legacyAction || "Encrypt", $("#legacy-input").value, $("#legacy-output").value));
}

/* --------------------------------------------------------------------------
   Hash generation and identification
   -------------------------------------------------------------------------- */

async function generateDigest(value, algorithm) {
  if (algorithm === "MD5") return md5(value);
  const result = await crypto.subtle.digest(algorithm, encoder.encode(value));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function identifyHash(value) {
  const clean = value.trim();
  const matches = [];
  if (/^[a-f0-9]{32}$/i.test(clean)) matches.push("MD5", "NTLM (same hexadecimal length)");
  if (/^[a-f0-9]{40}$/i.test(clean)) matches.push("SHA-1");
  if (/^[a-f0-9]{56}$/i.test(clean)) matches.push("SHA-224");
  if (/^[a-f0-9]{64}$/i.test(clean)) matches.push("SHA-256");
  if (/^[a-f0-9]{96}$/i.test(clean)) matches.push("SHA-384");
  if (/^[a-f0-9]{128}$/i.test(clean)) matches.push("SHA-512");
  if (/^\$2[aby]\$\d{2}\$.{53}$/.test(clean)) matches.push("bcrypt");
  if (/^\$argon2(id|i|d)\$/.test(clean)) matches.push("Argon2");
  if (/^[a-f0-9]{8}$/i.test(clean)) matches.push("CRC32 (possible)");
  return matches;
}

function initHashes() {
  if (!$("#generate-hash")) return;
  let lastAction = "";
  $("#generate-hash").addEventListener("click", async () => {
    const input = $("#hash-input").value;
    if (!input) return showToast("Enter text to hash.", "error");
    try {
      $("#hash-output").value = await generateDigest(input, $("#hash-algorithm").value);
      lastAction = "Hash";
    } catch { showToast("This browser could not generate that hash.", "error"); }
  });
  $("#hash-save").addEventListener("click", () => saveHistory($("#hash-algorithm").value, lastAction || "Hash", $("#hash-input").value, $("#hash-output").value));
  $("#identify-hash").addEventListener("click", () => {
    const value = $("#identify-input").value;
    const matches = identifyHash(value);
    $("#identify-result").innerHTML = matches.length
      ? `<strong>Possible type${matches.length > 1 ? "s" : ""}</strong><ul>${matches.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="subtle">Length-based identification is an educated guess, not proof.</p>`
      : `<strong>No common format recognized</strong><p class="subtle">Check for prefixes, non-hexadecimal encodings, or an incomplete value.</p>`;
  });
}

// Compact public-domain-style MD5 implementation for compatibility exercises.
function md5(string) {
  function rotate(x, c) { return (x << c) | (x >>> (32 - c)); }
  function add(x, y) { return (x + y) | 0; }
  const bytes = unescape(encodeURIComponent(string));
  const words = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] || 0) | bytes.charCodeAt(i) << ((i % 4) * 8);
  words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | 0x80 << ((bytes.length % 4) * 8);
  words[(((bytes.length + 8) >> 6) + 1) * 16 - 2] = bytes.length * 8;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const shifts = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  for (let offset = 0; offset < words.length; offset += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const temp = d; d = c; c = b;
      b = add(b, rotate(add(add(a, f), add(constants[i], words[offset + g] || 0)), shifts[i]));
      a = temp;
    }
    a0 = add(a0, a); b0 = add(b0, b); c0 = add(c0, c); d0 = add(d0, d);
  }
  return [a0, b0, c0, d0].map((word) => [0,8,16,24].map((shift) => ((word >>> shift) & 255).toString(16).padStart(2, "0")).join("")).join("");
}

/* --------------------------------------------------------------------------
   JWT decoding
   -------------------------------------------------------------------------- */

function decodeJwtPart(part) {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(base64ToUtf8(padded));
}

function initJwt() {
  if (!$("#decode-jwt")) return;
  $("#decode-jwt").addEventListener("click", () => {
    const error = $("#jwt-error");
    error.hidden = true;
    try {
      const parts = $("#jwt-input").value.trim().split(".");
      if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("A JWT must contain exactly three non-empty parts separated by periods.");
      $("#jwt-header").textContent = JSON.stringify(decodeJwtPart(parts[0]), null, 2);
      $("#jwt-payload").textContent = JSON.stringify(decodeJwtPart(parts[1]), null, 2);
      $("#jwt-signature").textContent = parts[2];
    } catch (caught) {
      error.textContent = caught.message || "The token could not be decoded. Check its format.";
      error.hidden = false;
    }
  });
  $("#jwt-example").addEventListener("click", () => {
    const header = utf8ToBase64(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const payload = utf8ToBase64(JSON.stringify({ sub: "1234567890", name: "CipherBox Learner", role: "student", iat: 1771430400 })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    $("#jwt-input").value = `${header}.${payload}.educational-signature-not-verified`;
    $("#decode-jwt").click();
  });
}

/* --------------------------------------------------------------------------
   IPv4 network and timestamp tools
   -------------------------------------------------------------------------- */

function parseIp(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) throw new Error("Enter a valid IPv4 address with four values from 0 to 255.");
  return parts.map(Number);
}
function ipToUint(parts) { return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0; }
function uintToIp(value) { return [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255].join("."); }
function prefixToMask(prefix) { return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0; }
function maskToPrefix(maskParts) {
  const binary = maskParts.map((part) => part.toString(2).padStart(8, "0")).join("");
  if (!/^1*0*$/.test(binary)) throw new Error("Subnet masks must contain contiguous 1 bits followed by 0 bits.");
  return binary.indexOf("0") === -1 ? 32 : binary.indexOf("0");
}
function ipScope(parts) {
  const [a, b] = parts;
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "Private";
  if (a === 127) return "Loopback";
  if (a === 169 && b === 254) return "Link-local";
  if (a >= 224) return a <= 239 ? "Multicast" : "Reserved";
  return "Public";
}
function ipClass(first) { return first < 128 ? "Class A" : first < 192 ? "Class B" : first < 224 ? "Class C" : first < 240 ? "Class D" : "Class E"; }

function calculateSubnet(value) {
  const [ipText, prefixText] = value.trim().split("/");
  if (prefixText === undefined || !/^\d{1,2}$/.test(prefixText)) throw new Error("Include a CIDR prefix, such as /24.");
  const prefix = Number(prefixText);
  if (prefix < 0 || prefix > 32) throw new Error("CIDR prefix must be between /0 and /32.");
  const parts = parseIp(ipText);
  const ip = ipToUint(parts), mask = prefixToMask(prefix), wildcard = (~mask) >>> 0;
  const network = (ip & mask) >>> 0, broadcast = (network | wildcard) >>> 0;
  const total = 2 ** (32 - prefix);
  const hosts = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, total - 2);
  const range = prefix === 32 ? uintToIp(network) : prefix === 31 ? `${uintToIp(network)} – ${uintToIp(broadcast)}` : `${uintToIp((network + 1) >>> 0)} – ${uintToIp((broadcast - 1) >>> 0)}`;
  return { ip: ipText, class: ipClass(parts[0]), scope: ipScope(parts), mask: uintToIp(mask), wildcard: uintToIp(wildcard), network: uintToIp(network), broadcast: uintToIp(broadcast), range, hosts: hosts.toLocaleString() };
}

function initNetwork() {
  if (!$("#calculate-subnet")) return;
  const calculate = () => {
    const error = $("#subnet-error"); error.hidden = true;
    try {
      const results = calculateSubnet($("#cidr-input").value);
      Object.entries(results).forEach(([key, value]) => { const item = $(`[data-result="${key}"]`); if (item) item.textContent = value; });
    } catch (caught) { error.textContent = caught.message; error.hidden = false; }
  };
  $("#calculate-subnet").addEventListener("click", calculate);
  $("#cidr-input").addEventListener("keydown", (event) => { if (event.key === "Enter") calculate(); });
  calculate();

  $("#convert-mask").addEventListener("click", () => {
    const input = $("#mask-input").value.trim();
    try {
      let prefix;
      if (/^\/?\d{1,2}$/.test(input)) {
        prefix = Number(input.replace("/", ""));
        if (prefix > 32) throw new Error("CIDR prefix must be between /0 and /32.");
      } else prefix = maskToPrefix(parseIp(input));
      const mask = prefixToMask(prefix);
      $("#mask-result").innerHTML = `<strong>/${prefix}</strong><p>Subnet mask: <code>${uintToIp(mask)}</code><br>Wildcard mask: <code>${uintToIp((~mask) >>> 0)}</code></p>`;
    } catch (error) { $("#mask-result").innerHTML = `<strong>Invalid mask</strong><p>${escapeHtml(error.message)}</p>`; }
  });

  const convertTimestamp = () => {
    const input = $("#timestamp-input").value.trim();
    let date;
    if (/^\d{10,13}$/.test(input)) date = new Date(Number(input) * (input.length === 10 ? 1000 : 1));
    else date = new Date(input);
    if (Number.isNaN(date.getTime())) return $("#timestamp-result").innerHTML = "<strong>Invalid timestamp or date</strong><p>Try a 10-digit Unix timestamp or an ISO-style date.</p>";
    $("#timestamp-result").innerHTML = `<strong>${Math.floor(date.getTime() / 1000)}</strong><p>UTC: ${escapeHtml(date.toUTCString())}<br>Local: ${escapeHtml(date.toLocaleString())}<br>ISO: ${escapeHtml(date.toISOString())}</p>`;
  };
  $("#convert-timestamp").addEventListener("click", convertTimestamp);
  $("#timestamp-now").addEventListener("click", () => { $("#timestamp-input").value = Math.floor(Date.now() / 1000); convertTimestamp(); });
}

/* --------------------------------------------------------------------------
   Practice mode
   -------------------------------------------------------------------------- */

const practiceWords = {
  Beginner: ["hello", "secure", "cipher", "network", "defend", "packet"],
  Intermediate: ["least privilege", "defense in depth", "verify the source", "trust but verify"],
  Advanced: ["authentication before authorization", "security is a shared responsibility", "monitor detect respond recover"]
};
const hashSamples = [
  { value: "5d41402abc4b2a76b9719d911017c592", answer: "MD5" },
  { value: "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed", answer: "SHA-1" },
  { value: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", answer: "SHA-256" }
];
let practiceState = { score: 0, streak: 0, solved: 0, number: 1, challenge: null, answered: false };

function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
function normalizeAnswer(value) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }

function buildChallenge() {
  const difficulty = $("#difficulty").value;
  const word = randomItem(practiceWords[difficulty]);
  let types = ["Base64", "Morse", "ROT13", "Hexadecimal", "Binary", "Hash identification"];
  if (difficulty !== "Beginner") types.push("Caesar cipher");
  const type = randomItem(types);
  let value, answer, prompt, hint, explanation;
  if (type === "Base64") {
    value = utf8ToBase64(word); answer = word; prompt = "Decode this Base64 value."; hint = "Base64 commonly ends in = padding and uses A–Z, a–z, 0–9, +, and /."; explanation = "Base64 groups bytes into 6-bit values and maps them to printable characters.";
  } else if (type === "Morse") {
    value = encoderTools.find((tool) => tool.id === "morse").encode(word); answer = word; prompt = "Translate this Morse code."; hint = "Spaces separate letters and / separates words."; explanation = "Morse represents letters as timed patterns of dots and dashes.";
  } else if (type === "ROT13") {
    value = rot13(word); answer = word; prompt = "Decode this ROT13 text."; hint = "Rotate each letter exactly 13 alphabet positions."; explanation = "ROT13 is symmetrical: the same operation both encodes and decodes.";
  } else if (type === "Caesar cipher") {
    const shift = difficulty === "Advanced" ? randomItem([7, 11, 19]) : randomItem([3, 5]);
    value = caesar(word, shift); answer = word; prompt = `Decode this Caesar cipher (shift ${shift}).`; hint = `Move each letter backward ${shift} positions.`; explanation = "A Caesar cipher shifts every letter by the same fixed amount.";
  } else if (type === "Hexadecimal") {
    value = encoderTools.find((tool) => tool.id === "hex").encode(word); answer = word; prompt = "Convert this hexadecimal UTF-8 data to text."; hint = "Each two-digit group represents one byte."; explanation = "Hexadecimal is a compact base-16 view of raw byte values.";
  } else if (type === "Binary") {
    value = encoderTools.find((tool) => tool.id === "binary").encode(word); answer = word; prompt = "Convert these binary bytes to text."; hint = "Read each 8-bit group as one byte."; explanation = "Eight binary bits form one byte, which can map to a text character.";
  } else {
    const sample = randomItem(hashSamples); value = sample.value; answer = sample.answer; prompt = "Identify the most likely hash type."; hint = `Count the hexadecimal characters: this sample has ${sample.value.length}.`; explanation = "Hash lengths often suggest a likely algorithm, though length alone cannot prove the type.";
  }
  return { difficulty, type, value, answer, prompt, hint, explanation };
}

function renderChallenge() {
  practiceState.challenge = buildChallenge();
  practiceState.answered = false;
  $("#challenge-type").textContent = practiceState.challenge.type;
  $("#challenge-difficulty").textContent = practiceState.challenge.difficulty;
  $("#challenge-number").textContent = practiceState.number;
  $("#challenge-prompt").textContent = practiceState.challenge.prompt;
  $("#challenge-value").textContent = practiceState.challenge.value;
  $("#challenge-answer").value = "";
  $("#challenge-feedback").hidden = true;
  $("#challenge-feedback").className = "feedback-panel";
  $("#challenge-hint").hidden = true;
  $("#challenge-hint p").textContent = practiceState.challenge.hint;
  $("#challenge-answer").focus();
}

function updatePracticeStats() {
  $("#practice-score").textContent = practiceState.score;
  $("#practice-streak").textContent = practiceState.streak;
  $("#practice-solved").textContent = practiceState.solved;
}

function initPractice() {
  if (!$("#check-answer")) return;
  renderChallenge();
  updatePracticeStats();
  $("#check-answer").addEventListener("click", () => {
    if (practiceState.answered) return showToast("Choose a new challenge to continue.", "error");
    const response = $("#challenge-answer").value;
    if (!response.trim()) return showToast("Enter an answer first.", "error");
    const correct = normalizeAnswer(response) === normalizeAnswer(practiceState.challenge.answer);
    const feedback = $("#challenge-feedback");
    feedback.hidden = false;
    practiceState.answered = true;
    if (correct) {
      const points = practiceState.challenge.difficulty === "Advanced" ? 30 : practiceState.challenge.difficulty === "Intermediate" ? 20 : 10;
      practiceState.score += points + practiceState.streak * 2;
      practiceState.streak += 1; practiceState.solved += 1;
      feedback.classList.add("success");
      feedback.innerHTML = `<strong>Correct!</strong><p>${escapeHtml(practiceState.challenge.explanation)}</p>`;
    } else {
      practiceState.streak = 0;
      feedback.classList.add("error");
      feedback.innerHTML = `<strong>Not quite.</strong><p>The answer is <strong>${escapeHtml(practiceState.challenge.answer)}</strong>. ${escapeHtml(practiceState.challenge.explanation)}</p>`;
    }
    updatePracticeStats();
  });
  $("#challenge-answer").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#check-answer").click(); });
  $("#new-challenge").addEventListener("click", () => { practiceState.number += 1; renderChallenge(); });
  $("#show-hint").addEventListener("click", () => { $("#challenge-hint").hidden = false; });
  $("#difficulty").addEventListener("change", () => { practiceState.number += 1; renderChallenge(); });
  $("#reset-practice").addEventListener("click", () => { practiceState = { score: 0, streak: 0, solved: 0, number: 1, challenge: null, answered: false }; updatePracticeStats(); renderChallenge(); showToast("Practice session reset."); });
}

/* --------------------------------------------------------------------------
   History page rendering and export
   -------------------------------------------------------------------------- */

function initHistoryPage() {
  if (!$("#history-list")) return;
  renderHistory();
  $("#clear-history").addEventListener("click", () => {
    if (!getHistory().length) return showToast("History is already empty.", "error");
    if (confirm("Clear all saved CipherBox history from this browser?")) {
      localStorage.removeItem(HISTORY_KEY); renderHistory(); showToast("History cleared.");
    }
  });
  $("#export-history").addEventListener("click", () => {
    const history = getHistory();
    if (!history.length) return showToast("There is no history to export.", "error");
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `cipherbox-history-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
  });
  $("#history-list").addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-history-copy]");
    const deleteButton = event.target.closest("[data-history-delete]");
    if (copyButton) {
      const item = getHistory().find((entry) => entry.id === copyButton.dataset.historyCopy);
      if (item) copyText(item.output);
    }
    if (deleteButton) {
      const history = getHistory().filter((entry) => entry.id !== deleteButton.dataset.historyDelete);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); renderHistory(); showToast("History item deleted.");
    }
  });
}

function renderHistory() {
  const history = getHistory(), list = $("#history-list"), empty = $("#history-empty");
  $("#history-count").textContent = history.length;
  empty.hidden = history.length > 0;
  list.innerHTML = history.map((item) => `
    <article class="history-item card">
      <span class="history-icon" aria-hidden="true">${item.action === "Hash" ? "#" : "↔"}</span>
      <div>
        <div class="history-meta"><strong>${escapeHtml(item.tool)}</strong><span class="badge badge-blue">${escapeHtml(item.action)}</span><time datetime="${item.timestamp}">${new Date(item.timestamp).toLocaleString()}</time></div>
        <div class="history-content"><div><strong>Input</strong><code title="${escapeHtml(item.input)}">${escapeHtml(item.input || "—")}</code></div><div><strong>Output</strong><code title="${escapeHtml(item.output)}">${escapeHtml(item.output)}</code></div></div>
      </div>
      <div class="history-actions"><button class="icon-button" data-history-copy="${item.id}" title="Copy output" aria-label="Copy output">⧉</button><button class="icon-button" data-history-delete="${item.id}" title="Delete item" aria-label="Delete history item">×</button></div>
    </article>`).join("");
}

/* Start only the modules needed by the current page. */
document.addEventListener("DOMContentLoaded", () => {
  initSharedUI();
  initEncoders();
  initEncryption();
  initHashes();
  initJwt();
  initNetwork();
  initPractice();
  initHistoryPage();
});
