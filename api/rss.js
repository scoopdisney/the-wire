export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    res.setHeader('Content-Type', 'text/xml');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}