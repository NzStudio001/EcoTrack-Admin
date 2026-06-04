// js/common.js

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { collection, query, orderBy, limit, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// ==========================================
// 1. GLOBAL MODAL FUNCTIONS
// ==========================================
window.openModal = function(modalId) {
    document.getElementById(modalId).classList.add('active');
}

window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

window.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});


// ==========================================
// 2. GLOBAL AUTHENTICATION & LOGOUT
// ==========================================
onAuthStateChanged(auth, (user) => {
    // If no user is logged in, and we aren't already on the login page, kick them out
    if (!user && !window.location.href.includes("login.html")) {
        window.location.href = "login.html";
    } else if (user) {
        // Update header with their admin email (if the element exists on the page)
        const emailDisplay = document.getElementById('adminEmailDisplay');
        if (emailDisplay) {
            emailDisplay.innerText = user.email;
        }
        
        // If we are specifically on the Dashboard page, load the charts and tables
        if (document.getElementById('dashboard')) {
            loadDashboardData();
        }
    }
});

// Attach secure logout to the logout button (if it exists on the page)
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = "login.html";
        }).catch((error) => {
            console.error("Logout Error", error);
        });
    });
}


// ==========================================
// 3. DASHBOARD-SPECIFIC LOGIC
// ==========================================
function loadDashboardData() {
    
    // --- A. Count Total Users ---
    const totalUsersEl = document.getElementById('totalUsersCount');
    if (totalUsersEl) {
        onSnapshot(collection(db, 'users'), (snapshot) => {
            totalUsersEl.innerText = snapshot.size;
        });
    }

    // --- B & C. Count Active Reports & Calculate Completion Rate ---
    const activeReportsEl = document.getElementById('activeReportsCount');
    const completionRateEl = document.getElementById('completionRateCount');
    const completionSubtitleEl = document.getElementById('completionRateSubtitle');

    if (activeReportsEl || completionRateEl) {
        // Fetch all reports to calculate both active count and completion rate
        onSnapshot(collection(db, 'reports'), (snapshot) => {
            let total = snapshot.size;
            let active = 0;
            let resolved = 0;

            snapshot.forEach(doc => {
                const status = (doc.data().status || '').toLowerCase();
                if (status === 'pending' || status === 'in progress') {
                    active++;
                } else if (status === 'resolved' || status === 'done' || status === 'completed') {
                    resolved++;
                }
            });

            // Update Active Reports
            if (activeReportsEl) {
                activeReportsEl.innerText = active;
            }

            // Update Completion Rate %
            if (completionRateEl) {
                if (total > 0) {
                    const rate = Math.round((resolved / total) * 100);
                    completionRateEl.innerText = rate + '%';
                    if (completionSubtitleEl) {
                        completionSubtitleEl.innerText = `↑ ${resolved} of ${total} resolved`;
                    }
                } else {
                    completionRateEl.innerText = '0%';
                    if (completionSubtitleEl) {
                        completionSubtitleEl.innerText = `No reports yet`;
                    }
                }
            }
        });
    }

    // --- D. Count Recycling Centers ---
    const totalCentersEl = document.getElementById('totalCentersCount');
    if (totalCentersEl) {
        onSnapshot(collection(db, 'recycle_centre'), (snapshot) => {
            totalCentersEl.innerText = snapshot.size;
        });
    }

    // --- E. Load Recent Reports into Table (Only showing 3) ---
    const tableBody = document.getElementById('recentActivityTable');
    if (tableBody) {
        const qRecent = query(collection(db, 'reports'), orderBy('timestamp', 'desc'), limit(3));
        
        onSnapshot(qRecent, (snapshot) => {
            tableBody.innerHTML = ''; // Clear the "Loading..." text

            if (snapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No reports found.</td></tr>';
                return;
            }

            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // Format the timestamp cleanly
                let timeString = 'Just now';
                if (data.timestamp) {
                    const date = data.timestamp.toDate();
                    timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                // Format the dynamic Status badge
                let statusClass = 'pending';
                let statusText = data.status || 'Pending';
                
                // Match the "Resolved" formatting setup
                if (statusText.toLowerCase() === 'done' || statusText.toLowerCase() === 'completed' || statusText.toLowerCase() === 'resolved') {
                    statusClass = 'completed';
                    statusText = 'Resolved';
                }
                if (statusText.toLowerCase() === 'in progress') statusClass = 'in-progress';
                if (statusText.toLowerCase() === 'rejected') statusClass = 'rejected';

                // Pull the Report Type directly from Firebase
                let reportType = data.type || 'Waste Report';
                
                let shortAddress = data.address ? data.address.substring(0, 35) + '...' : 'Location provided in app';

                // Build the HTML Row
                const row = `
                    <tr>
                        <td style="font-weight: 500;">${reportType}</td>
                        <td style="color: var(--text-secondary);">${shortAddress}</td>
                        <td>
                            <span class="status-badge ${statusClass}">
                                <span class="status-dot"></span>
                                ${statusText}
                            </span>
                        </td>
                        <td style="color: var(--text-secondary); font-size: 0.875rem;">${timeString}</td>
                    </tr>
                `;
                tableBody.innerHTML += row;
            });
        });
    }
}