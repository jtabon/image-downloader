import express from 'express';
import puppeteer from 'puppeteer';
import JSZip from 'jszip';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));
app.use(express.json({ limit: '1mb' }));

app.post('/grab', async (req, res) => {
  const { url } = req.body;
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const imageUrls = new Set();
  const pendingRequests = new Set();

  // Valid image extensions
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

  const isImageUrl = (url) => {
    return imageExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  // Track requests
  page.on('request', (req) => {
    const reqUrl = req.url();
    if (isImageUrl(reqUrl)) {
      pendingRequests.add(reqUrl);
    }
  });

  // Track successful image loads
  page.on('requestfinished', async (req) => {
    const res = req.response();
    const reqUrl = req.url();
    const contentType = res.headers()['content-type'] || '';
    if (isImageUrl(reqUrl) || contentType.startsWith('image/')) {
      imageUrls.add(reqUrl.split('?')[0]);
      pendingRequests.delete(reqUrl);
    }
  });

  // Remove failed requests
  page.on('requestfailed', (req) => {
    pendingRequests.delete(req.url());
  });

  try {
    // Navigate to the page and wait for idle
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Wait extra time for assets to load
    await new Promise((r) => setTimeout(r, 15000));

    // Wait until no image requests are pending
    const waitForPending = async () => {
      let stableCount = 0;
      while (stableCount < 5) {
        if (pendingRequests.size === 0) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    };
    await waitForPending();

    // Final buffer
    await new Promise((r) => setTimeout(r, 5000));
  } catch (e) {
    console.error('Navigation error:', e.message);
  }

  await browser.close();

  // Download and zip the images
  const zip = new JSZip();
  let count = 0;
  for (const imgUrl of imageUrls) {
    try {
      const response = await fetch(imgUrl);
      const buffer = await response.arrayBuffer();
      const ext = path.extname(imgUrl).split('?')[0];
      const filename =
        imgUrl.split('/').pop()?.split('?')[0] || `image${++count}${ext}`;
      zip.file(filename, Buffer.from(buffer));
    } catch (e) {
      console.warn(`Failed to download ${imgUrl}:`, e.message);
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="images.zip"',
  });
  res.send(zipBuffer);
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
