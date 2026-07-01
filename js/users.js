// js/users.js

import { app, db, auth } from './firebase-init.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// ==========================================
// CUSTOM POPUP FUNCTION (TOAST)
// ==========================================
window.showPopupMessage = function(message, type = 'success') {
    const popup = document.getElementById("customPopup");
    const msgText = document.getElementById("popupMessage");
    const icon = document.getElementById("popupIcon");

    msgText.innerText = message;
    
    // Reset classes
    popup.className = "custom-popup"; 
    
    if (type === 'error') {
        popup.classList.add("error");
        icon.innerText = "⚠️";
    } else {
        popup.classList.add("success");
        icon.innerText = "✅";
    }

    popup.classList.add("show");

    // Hide after 3 seconds
    setTimeout(function() {
        popup.classList.remove("show");
    }, 3000);
}

// ==========================================
// 1. TAB SWITCHING LOGIC
// ==========================================
window.showUserTab = function(type) {
    document.querySelectorAll(".user-section").forEach(section => {
        section.classList.remove("active");
    });
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    if(type === "citizen") {
        document.getElementById("citizenSection").classList.add("active");
        document.querySelectorAll(".tab-btn")[0].classList.add("active");
    } else {
        document.getElementById("wmoSection").classList.add("active");
        document.querySelectorAll(".tab-btn")[1].classList.add("active");
    }
}


// ==========================================
// 2. FETCH AND DISPLAY USERS FROM FIREBASE
// ==========================================
let allUsers = [];
let activeWorkloads = {};

function loadUsers() {
    
    // Listen to Reports to calculate ACTUAL active assignments
    onSnapshot(collection(db, 'reports'), (snapshot) => {
        activeWorkloads = {}; 
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const wmoId = data.assigned_wmo_id;
            const status = (data.status || 'Pending').toLowerCase();
            
            if (wmoId && status !== 'resolved' && status !== 'done' && status !== 'completed' && status !== 'rejected') {
                activeWorkloads[wmoId] = (activeWorkloads[wmoId] || 0) + 1;
            }
        });
        
        if (allUsers.length > 0) renderUserTables();
    });

    // Listen to Users
    onSnapshot(collection(db, 'users'), (snapshot) => {
        allUsers = [];
        snapshot.forEach(docSnap => {
            allUsers.push({ docId: docSnap.id, ...docSnap.data() });
        });
        renderUserTables();
    });
}

function renderUserTables() {
    const citizenTableBody = document.getElementById('citizenTableBody');
    const wmoTableBody = document.getElementById('wmoTableBody');
    
    citizenTableBody.innerHTML = '';
    wmoTableBody.innerHTML = '';

    if (allUsers.length === 0) {
        citizenTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No citizens found.</td></tr>';
        wmoTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No WMOs found.</td></tr>';
        return;
    }

    let citizenCount = 0;
    let wmoCount = 0;

    allUsers.forEach((data) => {
        const role = data.role ? data.role.toLowerCase() : 'citizen';
        const docId = data.docId;
        
        if (role === 'citizen') {
            citizenCount++;
            const points = data.points || 0;
            const name = data.name || 'Unknown';
            const email = data.email || 'No email';
            
            const row = `
                <tr>
                    <td style="font-weight: 500;">${name}</td>
                    <td>${email}</td>
                    <td><strong style="color: #0a7741;">${points}</strong></td>
                    <td><span class="status-badge completed">Active</span></td>
                    <td>
                        <button class="icon-btn" onclick="window.editUser('${docId}')">✏️</button>
                        <button class="icon-btn danger" onclick="window.deleteUser('${docId}')">🗑️</button>
                    </td>
                </tr>
            `;
            citizenTableBody.innerHTML += row;
            
        } else if (role.includes('waste management operator') || role === 'wmo') {
            wmoCount++;
            
            const fullUserId = data.uid || data.docId;
            const shortUserId = fullUserId.substring(0, 4).toUpperCase() + '...';
            
            const name = data.name || 'Unknown';
            const email = data.email || 'No email';
            const area = data.presint || 'N/A';
            const assignedReports = activeWorkloads[fullUserId] || 0;

            const row = `
                <tr>
                    <td title="${fullUserId}" style="font-weight: bold; color: var(--text-secondary); font-size: 0.8rem; cursor: help;">${shortUserId}</td>
                    <td style="font-weight: 500;">${name}</td>
                    <td>${email}</td>
                    <td>${area}</td>
                    <td style="font-weight: bold; text-align: center; color: var(--primary); font-size: 1.1rem;">${assignedReports}</td>
                    <td><span class="status-badge completed">Active</span></td>
                    <td>
                        <button class="icon-btn" onclick="window.editUser('${docId}')">✏️</button>
                        <button class="icon-btn danger" onclick="window.deleteUser('${docId}')">🗑️</button>
                    </td>
                </tr>
            `;
            wmoTableBody.innerHTML += row;
        }
    });

    if (citizenCount === 0) citizenTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No citizens found.</td></tr>';
    if (wmoCount === 0) wmoTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No WMOs found.</td></tr>';
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        loadUsers();
    }
});


// ==========================================
// 3. CREATE NEW WMO FROM MODAL
// ==========================================

// Toggle Password Visibility
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', function () {
        const pwdInput = document.getElementById('wmoPassword');
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            this.innerText = '🙈'; // Change icon to hide
        } else {
            pwdInput.type = 'password';
            this.innerText = '👁️'; // Change icon to show
        }
    });
}

document.getElementById('submitWmoBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const company = document.getElementById('wmoCompany').value.trim();
    const presint = document.getElementById('wmoPresint').value;
    const name = document.getElementById('wmoName').value.trim();
    const email = document.getElementById('wmoEmail').value.trim();
    const password = document.getElementById('wmoPassword').value;
    
    const errorMsg = document.getElementById('wmoErrorMsg');
    const submitBtn = document.getElementById('submitWmoBtn');

    if (!company || !name || !email || !password) {
        errorMsg.innerText = "Please fill out all fields.";
        errorMsg.style.display = "block";
        return;
    }

    if (password.length < 6) {
        errorMsg.innerText = "Password must be at least 6 characters.";
        errorMsg.style.display = "block";
        return;
    }

    submitBtn.innerText = "Creating...";
    submitBtn.disabled = true;
    errorMsg.style.display = "none";

    try {
        const secondaryApp = initializeApp(app.options, "Secondary");
        const secondaryAuth = getAuth(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUid = userCredential.user.uid;

        await setDoc(doc(db, "users", newUid), {
            "Assigned Reports": 0,
            company: company,
            createdAt: new Date().toISOString(),
            email: email,
            name: name,
            presint: presint,
            role: "waste management operator",
            uid: newUid
        });

        await signOut(secondaryAuth);

        document.getElementById('wmoForm').reset();
        window.closeModal('userModal');
        showPopupMessage("WMO Account created successfully!", "success");

    } catch (error) {
        console.error("Error creating WMO:", error);
        errorMsg.innerText = "Error: " + error.message;
        errorMsg.style.display = "block";
    } finally {
        submitBtn.innerText = "Create Account";
        submitBtn.disabled = false;
    }
});


// ==========================================
// 4. EDIT & DELETE USER FUNCTIONS
// ==========================================

let userToDeleteId = null;

// TRIGGER DELETE MODAL
window.deleteUser = function(id) {
    userToDeleteId = id; 
    window.openModal('deleteConfirmModal'); 
}

// EXECUTE DELETION
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!userToDeleteId) return;

    const btn = document.getElementById('confirmDeleteBtn');
    const originalText = btn.innerText;
    btn.innerText = "Deleting...";
    btn.disabled = true;

    try {
        await deleteDoc(doc(db, "users", userToDeleteId));
        window.closeModal('deleteConfirmModal');
        showPopupMessage("User successfully deleted!", "success");
    } catch (error) {
        showPopupMessage("Error deleting user: " + error.message, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        userToDeleteId = null; 
    }
});

// OPEN EDIT MODAL
window.editUser = function(id) {
    const user = allUsers.find(u => u.docId === id);
    if (!user) return;

    // Populate Core Fields
    document.getElementById('editUserId').value = id;
    document.getElementById('editUserName').value = user.name || "";
    document.getElementById('editUserEmail').value = user.email || "";
    
    const role = user.role ? user.role.toLowerCase() : 'citizen';
    const wmoFields = document.getElementById('editWmoFields');

    // Show extra fields if they are a WMO
    if (role.includes('waste management operator') || role === 'wmo') {
        wmoFields.style.display = "block";
        document.getElementById('editUserCompany').value = user.company || "";
        
        if (user.presint) document.getElementById('editUserPresint').value = user.presint;
    } else {
        wmoFields.style.display = "none"; 
    }

    window.openModal('editUserModal');
}

// SAVE EDITS TO FIREBASE
document.getElementById('saveEditUserBtn').addEventListener('click', async () => {
    const userId = document.getElementById('editUserId').value;
    const newEmail = document.getElementById('editUserEmail').value.trim();
    const btn = document.getElementById('saveEditUserBtn');

    if (!userId || !newEmail) {
        showPopupMessage("Email is a required field.", "error");
        return;
    }

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const updateData = { 
            email: newEmail
        };

        if (document.getElementById('editWmoFields').style.display === "block") {
            updateData.company = document.getElementById('editUserCompany').value.trim();
            updateData.presint = document.getElementById('editUserPresint').value;
        }

        await updateDoc(doc(db, "users", userId), updateData);
        window.closeModal('editUserModal');
        showPopupMessage("User updated successfully!", "success");

    } catch (error) {
        showPopupMessage("Error saving updates: " + error.message, "error");
    } finally {
        btn.innerText = "Save Changes";
        btn.disabled = false;
    }
});


// ==========================================
// 5. SEARCH FILTER LOGIC
// ==========================================
document.getElementById("userSearch").addEventListener("keyup", function () {
    let value = this.value.toLowerCase();
    let rows = document.querySelectorAll("#citizenTable tbody tr, #wmoTable tbody tr");

    rows.forEach(row => {
        if (row.innerText.includes("Loading")) return;
        row.style.display = row.textContent.toLowerCase().includes(value) ? "" : "none";
    });
});