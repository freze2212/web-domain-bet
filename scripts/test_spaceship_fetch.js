async function test() {
  try {
    const res = await fetch('https://www.spaceship.com/domains/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    console.log('HTTP Status:', res.status);
    const html = await res.text();
    console.log('HTML Length:', html.length);
    console.log('Title/Snippet:', html.slice(0, 500));
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

test();
