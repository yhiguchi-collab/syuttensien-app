const RADIUS_METERS = 10000;
const DEFAULT_CENTER = [33.590355, 130.401716]; // 福岡市（天神）
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

let map;
let marker;
let circle;
let circleHalo;

function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, 11);

  const GSI_ATTRIBUTION = '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

  const streetLayer = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: GSI_ATTRIBUTION,
    maxZoom: 18,
  });

  const satelliteLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    {
      attribution: GSI_ATTRIBUTION,
      maxZoom: 18,
    }
  ).addTo(map);

  const labelsLayer = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
    attribution: GSI_ATTRIBUTION,
    maxZoom: 18,
    className: "gsi-label-overlay",
  }).addTo(map);

  L.control
    .layers(
      { "地図": streetLayer, "航空写真": satelliteLayer },
      { "地名ラベル": labelsLayer }
    )
    .addTo(map);

  map.on("click", (event) => {
    setPoint(event.latlng.lat, event.latlng.lng);
  });

  document.getElementById("search-button").addEventListener("click", searchAddress);
  document.getElementById("address-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchAddress();
    }
  });
}

async function searchAddress() {
  const address = document.getElementById("address-input").value.trim();
  if (!address) {
    return;
  }

  const params = new URLSearchParams({ q: address, format: "json", limit: "1" });

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`);
    const results = await response.json();

    if (results.length === 0) {
      alert("該当する地点が見つかりませんでした");
      return;
    }

    const { lat, lon } = results[0];
    setPoint(parseFloat(lat), parseFloat(lon));
    map.setZoom(12);
  } catch (error) {
    alert("検索中にエラーが発生しました");
  }
}

function setPoint(lat, lng) {
  map.setView([lat, lng]);

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }

  if (circleHalo) {
    circleHalo.setLatLng([lat, lng]);
  } else {
    circleHalo = L.circle([lat, lng], {
      radius: RADIUS_METERS,
      color: "#ffffff",
      weight: 6,
      fill: false,
    }).addTo(map);
  }

  if (circle) {
    circle.setLatLng([lat, lng]);
  } else {
    circle = L.circle([lat, lng], {
      radius: RADIUS_METERS,
      color: "#d6336c",
      fillColor: "#d6336c",
      fillOpacity: 0.1,
      weight: 3,
    }).addTo(map);
  }
}

document.addEventListener("DOMContentLoaded", initMap);
