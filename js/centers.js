// js/centers.js

import { db } from './firebase-init.js';
import { collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

let map;
let markersArray = []; 
let allCenters = {}; 

// ==========================================
// CUSTOM POPUP FUNCTION (TOAST)
// ==========================================
window.showPopupMessage = function(message, type = 'success') {
    const popup = document.getElementById("customPopup");
    const msgText = document.getElementById("popupMessage");
    const icon = document.getElementById("popupIcon");

    msgText.innerText = message;
    
    popup.className = "custom-popup"; 
    
    if (type === 'error') {
        popup.classList.add("error");
        icon.innerText = "⚠️";
    } else {
        popup.classList.add("success");
        icon.innerText = "✅";
    }

    popup.classList.add("show");

    setTimeout(function() {
        popup.classList.remove("show");
    }, 3000);
}

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
        allCenters = {}; 

        markersArray.forEach(marker => map.removeLayer(marker));
        markersArray = [];

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No recycling centers found.</td></tr>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            allCenters[id] = data; 
            
            let safeStatus = data.status || "Active";
            let statusClass = 'completed'; 
            if (safeStatus.toLowerCase() === 'maintenance' || safeStatus.toLowerCase() === 'pending') {
                statusClass = 'pending'; 
            } else if (safeStatus.toLowerCase() === 'closed') {
                statusClass = 'rejected'; 
            }

            const row = `
                <tr>
                    <td style="font-weight: bold;">${data.center_id}</td>
                    <td style="font-weight: 500;">
                        ${data.name}
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
                        <button class="icon-btn" title="View Details" onclick="window.viewCenter('${id}')">ℹ️</button>
                        <button class="icon-btn" title="Edit Center" onclick="window.editCenter('${id}')">✏️</button>
                        <button class="icon-btn danger" title="Delete Center" onclick="window.deleteCenter('${id}')">🗑️</button>
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;

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
// 3. ADD NEW CENTER
// ==========================================
document.getElementById('submitCenterBtn').addEventListener('click', async (e) => {
    e.preventDefault();

    const name = document.getElementById('centerName').value.trim();
    const presint = document.getElementById('centerPresint').value;
    const details = document.getElementById('centerDetails').value.trim();
    const address = document.getElementById('centerAddress').value.trim();
    const contact = document.getElementById('centerContact').value.trim();
    const hours = document.getElementById('centerHours').value.trim();

    const errorMsg = document.getElementById('centerErrorMsg');
    const submitBtn = document.getElementById('submitCenterBtn');

    if (!name || !address) {
        errorMsg.innerText = "Please fill in all required fields (Name and Address).";
        errorMsg.style.display = "block";
        return;
    }

    submitBtn.innerText = "Locating & Saving...";
    submitBtn.disabled = true;
    errorMsg.style.display = "none";

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const geocodeData = await response.json();

        if (!geocodeData || geocodeData.length === 0) {
            errorMsg.innerText = "Could not find coordinates for this address. Please be more specific (e.g. add 'Putrajaya').";
            errorMsg.style.display = "block";
            submitBtn.innerText = "Save Center";
            submitBtn.disabled = false;
            return;
        }

        const lat = parseFloat(geocodeData[0].lat);
        const lng = parseFloat(geocodeData[0].lon);

        const autoCenterId = "RC" + Math.floor(10000 + Math.random() * 90000); 

        await setDoc(doc(db, "recycle_centre", autoCenterId), {
            center_id: autoCenterId,
            name: name,
            details: details,
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
        showPopupMessage(`Recycling Center added! ID: ${autoCenterId}`, "success");
        
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
// 4. VIEW & EDIT CENTER FUNCTIONS
// ==========================================

// VIEW DETAILS (UPDATED WITHOUT COORDINATES)
window.viewCenter = function(id) {
    const center = allCenters[id];
    if (!center) return;

    document.getElementById('viewCenterName').innerText = center.name || "Unknown Center";
    document.getElementById('viewCenterId').innerText = center.center_id || id;
    document.getElementById('viewCenterPresint').innerText = center.presint || "N/A";
    document.getElementById('viewCenterContact').innerText = center.contact || "N/A";
    document.getElementById('viewCenterStatus').innerText = center.status || "Active";
    document.getElementById('viewCenterHours').innerText = center.operating_hours || "N/A";
    document.getElementById('viewCenterAddress').innerText = center.address || "N/A";
    document.getElementById('viewCenterDetails').innerText = center.details || "No details provided.";

    window.openModal('viewCenterModal');
}

// EDIT DETAILS
window.editCenter = function(id) {
    const center = allCenters[id];
    if (!center) return;

    document.getElementById('editCenterId').value = id; 
    document.getElementById('editCenterName').value = center.name || "";
    document.getElementById('editCenterDetails').value = center.details || "";
    document.getElementById('editCenterPresint').value = center.presint || "Presint 1";
    document.getElementById('editCenterAddress').value = center.address || "";
    document.getElementById('editCenterLat').value = center.latitude || "";
    document.getElementById('editCenterLng').value = center.longitude || "";
    document.getElementById('editCenterContact').value = center.contact || "";
    document.getElementById('editCenterHours').value = center.operating_hours || "";
    document.getElementById('editCenterStatus').value = center.status || "Active";

    window.openModal('editCenterModal');
}

// SAVE EDITS
document.getElementById('saveEditCenterBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('editCenterId').value;
    const name = document.getElementById('editCenterName').value.trim();
    const details = document.getElementById('editCenterDetails').value.trim();
    const presint = document.getElementById('editCenterPresint').value;
    const address = document.getElementById('editCenterAddress').value.trim();
    
    // Read hidden coordinates directly
    const lat = document.getElementById('editCenterLat').value;
    const lng = document.getElementById('editCenterLng').value;
    
    const contact = document.getElementById('editCenterContact').value.trim();
    const hours = document.getElementById('editCenterHours').value.trim();
    const status = document.getElementById('editCenterStatus').value;

    const btn = document.getElementById('saveEditCenterBtn');
    
    if (!name || !address) {
        showPopupMessage("Please ensure name and address fields are filled out.", "error");
        return;
    }

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "recycle_centre", id), {
            name: name,
            details: details,
            presint: presint,
            address: address,
            contact: contact,
            operating_hours: hours,
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            status: status
        });
        
        window.closeModal('editCenterModal');
        showPopupMessage("Center updated successfully!", "success");
    } catch (error) {
        showPopupMessage("Error saving updates: " + error.message, "error");
    } finally {
        btn.innerText = "Save Changes";
        btn.disabled = false;
    }
});


// ==========================================
// 5. DELETE CENTER FUNCTION
// ==========================================
let centerToDeleteId = null;

window.deleteCenter = function(id) {
    centerToDeleteId = id;
    window.openModal('deleteConfirmModal');
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!centerToDeleteId) return;

    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.innerText;
    btn.innerText = "Deleting...";
    btn.disabled = true;

    try {
        await deleteDoc(doc(db, "recycle_centre", centerToDeleteId));
        window.closeModal('deleteConfirmModal');
        showPopupMessage("Center successfully deleted!", "success");
    } catch (error) {
        showPopupMessage("Error deleting: " + error.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        centerToDeleteId = null;
    }
});


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