# raphael-cipherbox-V1
# Raphael CipherBox

Raphael CipherBox is a responsive, multi-page cybersecurity utility and learning toolkit built with plain HTML, CSS, and JavaScript. It is designed for GitHub Pages and requires no backend.

## Included pages

- `index.html` — project home and featured tools
- `encoders.html` — Base64, URL, hex, binary, ASCII, HTML entities, Unicode, Morse, ROT13, Caesar cipher, and reverse text
- `encryption.html` — browser-native AES-GCM, XOR, and clearly labeled legacy cipher simulations
- `hashes.html` — MD5, SHA-1, SHA-256, SHA-384, SHA-512, and hash identification
- `jwt.html` — JWT header, payload, and signature inspection
- `network.html` — IPv4 CIDR calculations, masks, ranges, and Unix timestamps
- `practice.html` — randomized learning challenges with scoring and hints
- `history.html` — local history, copying, deletion, and JSON export
- `about.html` — project purpose, concepts, disclaimers, and roadmap

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a GitHub repository and add these files at the repository root.
2. Push the repository to GitHub.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the main branch and `/ (root)`, then save.

## Security notes

- Tools process data locally in the browser.
- AES uses the Web Crypto API with AES-256-GCM and PBKDF2-derived keys.
- DES and Triple DES are intentionally presented as learning simulations, not production implementations.
- JWT decoding does not verify a signature.
- MD5 and SHA-1 are included for compatibility education and should not protect security-sensitive data.
- Do not enter real secrets, private keys, production tokens, or regulated data into learning tools.

## Browser support

Use a current version of Chrome, Edge, Firefox, or Safari. AES requires a secure context, which includes HTTPS hosting and localhost.
