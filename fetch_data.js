const fs = require('fs');
const https = require('http'); // overpass is on http

const overpassUrl = "http://overpass-api.de/api/interpreter";
const overpassQuery = `
[out:json][timeout:25];
area["name"="Harare"]->.searchArea;
(
  node["amenity"~"hospital|clinic|pharmacy|doctors|dentist"](area.searchArea);
  way["amenity"~"hospital|clinic|pharmacy|doctors|dentist"](area.searchArea);
);
out center;
`;

console.log("Fetching data from Overpass API...");

const req = https.request(overpassUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(overpassQuery)
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const jsonData = JSON.parse(data);
      const features = [];
      
      for (const element of jsonData.elements) {
        const lon = element.lon || (element.center && element.center.lon);
        const lat = element.lat || (element.center && element.center.lat);
        if (!lon || !lat) continue;
        
        const tags = element.tags || {};
        const name = tags.name || 'Unnamed Facility';
        const amenity = tags.amenity || 'unknown';
        
        features.push({
          type: "Feature",
          properties: {
            name: name,
            healthcare: amenity,
            ...tags
          },
          geometry: {
            type: "Point",
            coordinates: [lon, lat]
          }
        });
      }
      
      const geojson = {
        type: "FeatureCollection",
        features: features
      };
      
      fs.writeFileSync('data/harare.geojson', JSON.stringify(geojson, null, 2));
      console.log(`Saved ${features.length} facilities to data/harare.geojson`);
    } catch (e) {
      console.error("Error parsing data", e);
    }
  });
});

req.on('error', (e) => console.error("Error fetching data:", e));
req.write(overpassQuery);
req.end();
