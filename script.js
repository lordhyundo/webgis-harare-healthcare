// Initialize map pointing generally to Harare
const map = L.map('map', {
    center: [-17.8216, 31.0492],
    zoom: 12,
    fullscreenControl: true
});

// Define Basemaps
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
});

const darkMatterLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20
});

// Set default basemap
osmLayer.addTo(map);

// Add Scale Bar
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

// Coordinate Tracking on Mouse Move
map.on('mousemove', function(e) {
    const coords = document.getElementById('coordinate-display');
    coords.innerHTML = `Lat: ${e.latlng.lat.toFixed(4)}, Lng: ${e.latlng.lng.toFixed(4)}`;
});

// Initialize Layer Groups for Layer Control
const healthcareLayerGroup = L.layerGroup();
const boundaryLayerGroup = L.layerGroup();

// Global array for search functionality
let healthcareFeatures = [];
let healthcareGeoJSONLayer = null;

/**
 * Convert Polygon/MultiPolygon geometry to centroid Point
 */
function toCentroidPoint(feature) {
    if (feature.geometry.type === 'Point') return feature;

    let coords = [];
    if (feature.geometry.type === 'Polygon') {
        coords = feature.geometry.coordinates[0];
    } else if (feature.geometry.type === 'MultiPolygon') {
        coords = feature.geometry.coordinates[0][0];
    }

    if (coords.length === 0) return null;

    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;

    return {
        ...feature,
        geometry: {
            type: 'Point',
            coordinates: [lng, lat]
        }
    };
}

/**
 * Returns icon class and background color based on healthcare type
 */
function getIconData(type) {
    let iconClass = 'fa-plus';
    let bgColor = 'icon-default';

    if (!type) return { icon: iconClass, color: bgColor };

    type = type.toLowerCase();

    if (type.includes('hospital')) {
        iconClass = 'fa-hospital';
        bgColor = 'icon-hospital';
    } else if (type.includes('clinic') || type.includes('birthing') || type.includes('laboratory')) {
        iconClass = 'fa-house-medical';
        bgColor = 'icon-clinic';
    } else if (type.includes('pharmacy') || type.includes('optometrist')) {
        iconClass = 'fa-pills';
        bgColor = 'icon-pharmacy';
    } else if (type.includes('doctor') || type.includes('practitioner') || type.includes('dentist')) {
        iconClass = 'fa-user-doctor';
        bgColor = 'icon-doctor';
    }

    return { icon: iconClass, color: bgColor };
}

/**
 * Creates Custom DivIcon for Leaflet
 */
function createCustomIcon(type) {
    const iconData = getIconData(type);
    return L.divIcon({
        className: 'custom-icon-wrapper',
        html: `<div class="custom-marker ${iconData.color}"><i class="fa-solid ${iconData.icon}"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });
}

/**
 * Boundary Layer Styling
 */
const boundaryStyle = {
    color: '#64ffda',
    weight: 2,
    opacity: 0.8,
    fillColor: '#64ffda',
    fillOpacity: 0.05,
    dashArray: '5, 5'
};

/**
 * Load and display Harare Boundary GeoJSON
 */
async function loadBoundary() {
    try {
        const response = await fetch('data/clipping_boundary.geojson');
        if (!response.ok) throw new Error('Failed to load boundary data');

        const data = await response.json();

        const boundaryLayer = L.geoJSON(data, {
            style: boundaryStyle,
            onEachFeature: function(feature, layer) {
                layer.on({
                    mouseover: function(e) {
                        e.target.setStyle({ weight: 4, fillOpacity: 0.15 });
                        e.target.bringToBack();
                    },
                    mouseout: function(e) {
                        boundaryLayer.resetStyle(e.target);
                    }
                });
            }
        });

        boundaryLayer.addTo(boundaryLayerGroup);
        boundaryLayerGroup.addTo(map);

        map.fitBounds(boundaryLayer.getBounds());
    } catch (error) {
        console.error('Error loading boundary:', error);
    }
}

/**
 * Load and display Healthcare Facilities GeoJSON
 */
async function loadHealthcare() {
    try {
        const response = await fetch('data/harare.geojson');
        if (!response.ok) throw new Error('Failed to load healthcare data');

        const data = await response.json();

        // Convert ALL features to Point (centroid for polygons)
        const pointFeatures = data.features
            .map(f => toCentroidPoint(f))
            .filter(f => f !== null); // remove any null results

        const pointGeoJSON = {
            type: 'FeatureCollection',
            features: pointFeatures
        };

        healthcareFeatures = pointFeatures; // Save for search

        healthcareGeoJSONLayer = L.geoJSON(pointGeoJSON, {
            pointToLayer: function (feature, latlng) {
                const type = feature.properties.healthcare || feature.properties.amenity || 'unknown';
                return L.marker(latlng, { icon: createCustomIcon(type) });
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const name = props.name || 'Unnamed Facility';
                const type = props.healthcare || props.amenity || 'Unknown Type';
                const address = props.address || props['addr:street'] || props['addr:full'] || 'No address available';
                const operator = props.operator || '-';
                const opening_hours = props.opening_hours || '-';

                const popupContent = `
                    <div class="custom-popup">
                        <h3>${name}</h3>
                        <p><strong>Type:</strong> ${type.charAt(0).toUpperCase() + type.slice(1)}</p>
                        <p><strong>Address:</strong> ${address}</p>
                        <p><strong>Operator:</strong> ${operator}</p>
                        <p><strong>Opening Hours:</strong> ${opening_hours}</p>
                    </div>
                `;

                layer.bindPopup(popupContent, { minWidth: 260 });
            }
        });

        healthcareGeoJSONLayer.addTo(healthcareLayerGroup);
        healthcareLayerGroup.addTo(map);

        console.log(`Loaded ${pointFeatures.length} healthcare facilities`);

        setupSearch();
    } catch (error) {
        console.error('Error loading healthcare:', error);
    }
}

/**
 * Setup Custom Search Functionality
 */
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        searchResults.innerHTML = '';

        if (query.length < 2) return;

        const filtered = healthcareFeatures.filter(f => {
            const nameMatch = f.properties.name && f.properties.name.toLowerCase().includes(query);
            const typeMatch = (f.properties.healthcare && f.properties.healthcare.toLowerCase().includes(query)) ||
                              (f.properties.amenity && f.properties.amenity.toLowerCase().includes(query));
            return nameMatch || typeMatch;
        }).slice(0, 10);

        if (filtered.length === 0) {
            searchResults.innerHTML = '<li style="color:var(--text-muted)">No facilities found</li>';
            return;
        }

        filtered.forEach(f => {
            const li = document.createElement('li');
            const type = f.properties.healthcare || f.properties.amenity || 'Unknown';
            li.innerHTML = `<strong>${f.properties.name || 'Unnamed'}</strong><br>
                            <small style="color:var(--text-muted)">${type}</small>`;
            li.onclick = () => {
                const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
                map.flyTo(latlng, 17, { duration: 1.5 });

                healthcareGeoJSONLayer.eachLayer(layer => {
                    if (layer.feature === f) {
                        setTimeout(() => layer.openPopup(), 1500);
                    }
                });

                searchInput.value = '';
                searchResults.innerHTML = '';
            };
            searchResults.appendChild(li);
        });
    });
}

/**
 * Initialize WebGIS App
 */
async function initApp() {
    const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Dark Matter Base": darkMatterLayer
    };

    const overlayMaps = {
        "Harare Boundary": boundaryLayerGroup,
        "Healthcare Facilities": healthcareLayerGroup
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false, position: 'topright' }).addTo(map);

    await Promise.all([
        loadBoundary(),
        loadHealthcare()
    ]);

    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.visibility = 'hidden';
            setTimeout(() => loader.remove(), 500);
        }
    }, 1200);
}

// Boot application
initApp();