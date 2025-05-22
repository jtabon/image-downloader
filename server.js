import express from 'express';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import AdmZip from 'adm-zip';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/grab', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send('No URL provided');

  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const imgUrls = Array.from(doc.querySelectorAll('img'))
      .map(img => img.src)
      .filter(src => /\.(png|jpe?g|gif|webp)$/i.test(src));

    const zip = new AdmZip();
    let count = 0;

    for (const imgUrl of imgUrls) {
      try {
        const imgResp = await fetch(imgUrl);
        const buffer = await imgResp.buffer();
        const fileName = `image${++count}.${imgUrl.split('.').pop().split('?')[0]}`;
        zip.addFile(fileName, buffer);
      } catch (e) {
        console.warn(`Failed to download ${imgUrl}:`, e.message);
      }
    }

    const zipBuffer = zip.toBuffer();
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename=images.zip');
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).send('Error grabbing images');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
