import { el } from './ui.js';
import { looksLikeFrn } from './db.js';

/**
 * Pulls the FRN back out of whatever a QR code decoded to. Farmer cards
 * (see card.js) encode the farmer's full profile URL, not a bare FRN -
 * that's what lets a generic phone camera/QR app open the card directly
 * in a browser, while this in-app scanner just parses the same URL back
 * out. Falls back to treating the whole decoded string as a bare FRN
 * (validated the same way search inputs already are) in case a QR code
 * was ever generated with just the FRN.
 */
function extractFrn(decodedText) {
  const urlMatch = decodedText.match(/#\/farmer\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1].toUpperCase();
  const trimmed = decodedText.trim();
  if (looksLikeFrn(trimmed)) return trimmed.toUpperCase();
  return null;
}

/**
 * Opens a full-screen camera overlay, scans for a QR code, and resolves
 * with the decoded FRN - or null if the user cancels, camera access
 * fails, or the code doesn't decode to anything recognizable. Reused by
 * every screen with a farmer search bar (see findFarmer.js, buyProduce.js
 * renderBuyProduceEntry) so the camera/decode logic only lives in one
 * place.
 */
export function openQrScanner() {
  return new Promise((resolve) => {
    let stream = null;
    let rafId = null;
    let settled = false;

    const video = el('video', { autoplay: true, playsinline: true, muted: true, class: 'qr-scanner-video' });
    const messageBox = el('p', { class: 'qr-scanner-message', hidden: true });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    const overlay = el('div', { class: 'qr-scanner-overlay' }, [
      video,
      el('div', { class: 'qr-scanner-frame' }),
      messageBox,
      cancelBtn,
    ]);

    function finish(result) {
      if (settled) return;
      settled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      overlay.remove();
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => finish(null));

    document.body.appendChild(overlay);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      messageBox.textContent = 'Camera scanning isn’t supported on this device. You can still search by name or FRN.';
      messageBox.hidden = false;
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (mediaStream) => {
        if (settled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const { default: jsQR } = await import('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        function tick() {
          if (settled) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              const frn = extractFrn(code.data);
              if (frn) {
                finish(frn);
                return;
              }
              messageBox.textContent = 'That doesn’t look like a Malaika Honey farmer code. Try again.';
              messageBox.hidden = false;
            }
          }
          rafId = requestAnimationFrame(tick);
        }
        rafId = requestAnimationFrame(tick);
      })
      .catch(() => {
        messageBox.textContent = 'Couldn’t open the camera. You can still search by name or FRN.';
        messageBox.hidden = false;
      });
  });
}
