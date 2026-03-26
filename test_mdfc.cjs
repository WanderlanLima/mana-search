const axios = require('axios');

async function test() {
  const cards = [
    "Boggart Trawler",
    "Hydroelectric Specimen",
    "Fell the Profane"
  ];
  
  const identifiers = cards.map(name => ({ name }));
  try {
    const res = await axios.post('https://api.scryfall.com/cards/collection', { identifiers });
    console.log("Found:", res.data.data.map(c => c.name));
    if (res.data.not_found) {
      console.log("NOT FOUND:", res.data.not_found);
    }
  } catch (err) {
    if (err.response) {
      console.error(err.response.data);
    } else {
      console.error(err);
    }
  }
}

test();
