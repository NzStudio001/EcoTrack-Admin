// js/centers.js

import { db } from './firebase-init.js';
import { collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

let map;
let markersArray = []; 
let allCenters = {}; // Cache to store data for the Edit Modal

// ==========================================
// 1. INITIALIZE LEAFLET MAP
// ==========================================
map = L.map("centerMap").setView([2.9264, 101.6964], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
}).addTo(map);


// ==========================================
// 2. FETCH DATA FROM FIREBASE (Table & Map)
// ==========================================
function loadCenters() {
    const q = query(collection(db, 'recycle_centre'), orderBy('center_id'));
    
    onSnapshot(q, (snapshot) => {
        const tableBody = document.getElementById('centersTableBody');
        tableBody.innerHTML = '';
        allCenters = {}; // Reset cache

        // Clear all existing markers from the map before redrawing
        markersArray.forEach(marker => map.removeLayer(marker));
        markersArray = [];

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No recycling centers found.</td></tr>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            allCenters[id] = data; // Save to cache for editing
            
            // Format the status badge color
            let safeStatus = data.status || "Active";
            let statusClass = 'completed'; // Green for Active
            if (safeStatus.toLowerCase() === 'maintenance' || safeStatus.toLowerCase() === 'pending') {
                statusClass = 'pending'; // Orange for Maintenance
            } else if (safeStatus.toLowerCase() === 'closed') {
                statusClass = 'rejected'; // Red for Closed
            }

            const row = `
                <tr>
                    <td style="font-weight: bold;">${data.center_id}</td>
                    <td style="font-weight: 500;">
                        ${data.name}<br>
                        <span style="font-size:0.75rem; color: var(--primary);">Lat: ${data.latitude} | Lng: ${data.longitude}</span>
                    </td>
                    <td>${data.presint}</td>
                    <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${data.address}</span></td>
                    <td>${data.contact}<br><span style="font-size: 0.85rem; color: var(--text-secondary);">${data.operating_hours}</span></td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            <span class="status-dot"></span>
                            ${safeStatus}
                        </span>
                    </td>
                    <td>
                        <button class="icon-btn" onclick="window.editCenter('${id}')">✏️</button>
                        <button class="icon-btn danger" onclick="window.deleteCenter('${id}')">🗑️</button>
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;

            // Add marker to map
            if (data.latitude && data.longitude) {
                const marker = L.marker([parseFloat(data.latitude), parseFloat(data.longitude)])
                    .addTo(map)
                    .bindPopup(`<b>${data.name}</b><br>${data.operating_hours}`);
                
                markersArray.push(marker); 
            }
        });
    });
}

loadCenters();


// ==========================================
// 3. ADD NEW CENTER (WITH AUTO-GEOCODING)
// ==========================================
document.getElementById('submitCenterBtn').addEventListener('click', async (e) => {
    e.preventDefault();

    const centerId = document.getElementById('centerId').value.trim();
    const name = document.getElementById('centerName').value.trim();
    const presint = document.getElementById('centerPresint').value;
    const address = document.getElementById('centerAddress').value.trim();
    const contact = document.getElementById('centerContact').value.trim();
    const hours = document.getElementById('centerHours').value.trim();

    const errorMsg = document.getElementById('centerErrorMsg');
    const submitBtn = document.getElementById('submitCenterBtn');

    if (!centerId || !name || !address) {
        errorMsg.innerText = "Please fill in all required fields.";
        errorMsg.style.display = "block";
        return;
    }

    submitBtn.innerText = "Locating & Saving...";
    submitBtn.disabled = true;
    errorMsg.style.display = "none";

    try {
        // --- CALL OPENSTREETMAP API TO FIND COORDINATES ---
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const geocodeData = await response.json();

        if (!geocodeData || geocodeData.length === 0) {
            errorMsg.innerText = "Could not find coordinates for this address. Please be more specific (e.g. add 'Putrajaya').";
            errorMsg.style.display = "block";
            submitBtn.innerText = "Save Center";
            submitBtn.disabled = false;
            return;
        }

        // Extract the most relevant Latitude and Longitude
        const lat = parseFloat(geocodeData[0].lat);
        const lng = parseFloat(geocodeData[0].lon);

        // --- SAVE TO FIREBASE ---
        await setDoc(doc(db, "recycle_centre", centerId), {
            center_id: centerId,
            name: name,
            presint: presint,
            address: address,
            contact: contact,
            operating_hours: hours,
            latitude: lat,
            longitude: lng,
            status: "Active"
        });

        document.getElementById('centerForm').reset();
        window.closeModal('centerModal');
        
    } catch (error) {
        console.error("Error adding center: ", error);
        errorMsg.innerText = "Error: " + error.message;
        errorMsg.style.display = "block";
    } finally {
        submitBtn.innerText = "Save Center";
        submitBtn.disabled = false;
    }
});


// ==========================================
// 4. EDIT CENTER FUNCTION
// ==========================================
window.editCenter = function(id) {
    const center = allCenters[id];
    if (!center) return;

    // Populate the form fields with existing data
    document.getElementById('editCenterId').value = id; // Read-Only Document ID
    document.getElementById('editCenterName').value = center.name || "";
    document.getElementById('editCenterPresint').value = center.presint || "Presint 1, 2, 3";
    document.getElementById('editCenterAddress').value = center.address || "";
    document.getElementById('editCenterLat').value = center.latitude || "";
    document.getElementById('editCenterLng').value = center.longitude || "";
    document.getElementById('editCenterContact').value = center.contact || "";
    document.getElementById('editCenterHours').value = center.operating_hours || "";
    document.getElementById('editCenterStatus').value = center.status || "Active";

    window.openModal('editCenterModal');
}

// SAVE EDITS TO FIREBASE
document.getElementById('saveEditCenterBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('editCenterId').value;
    const name = document.getElementById('editCenterName').value.trim();
    const presint = document.getElementById('editCenterPresint').value;
    const address = document.getElementById('editCenterAddress').value.trim();
    const lat = document.getElementById('editCenterLat').value;
    const lng = document.getElementById('editCenterLng').value;
    const contact = document.getElementById('editCenterContact').value.trim();
    const hours = document.getElementById('editCenterHours').value.trim();
    const status = document.getElementById('editCenterStatus').value;

    const btn = document.getElementById('saveEditCenterBtn');
    
    if (!name || !address || !lat || !lng) {
        alert("Please ensure all location and name fields are filled out.");
        return;
    }

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "recycle_centre", id), {
            name: name,
            presint: presint,
            address: address,
            contact: contact,
            operating_hours: hours,
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            status: status
        });
        
        window.closeModal('editCenterModal');
    } catch (error) {
        alert("Error saving updates: " + error.message);
    } finally {
        btn.innerText = "Save Changes";
        btn.disabled = false;
    }
});


// ==========================================
// 5. DELETE CENTER FUNCTION
// ==========================================
window.deleteCenter = async function(id) {
    if (confirm(`Are you sure you want to permanently delete Center ID: ${id}?`)) {
        try {
            await deleteDoc(doc(db, "recycle_centre", id));
        } catch (error) {
            alert("Error deleting: " + error.message);
        }
    }
}


// ==========================================
// 6. SEARCH FILTER LOGIC
// ==========================================
document.getElementById("centerSearch").addEventListener("keyup", function () {
    let value = this.value.toLowerCase();
    let rows = document.querySelectorAll("#centersTableBody tr");

    rows.forEach(row => {
        if (row.innerText.includes("Loading")) return;
        row.style.display = row.textContent.toLowerCase().includes(value) ? "" : "none";
    });
});