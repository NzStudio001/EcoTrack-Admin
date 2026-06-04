// 1. Import Firebase setup (Path is just './' because they are in the same folder)
import { auth } from './firebase-init.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

// 2. Grab elements from the HTML
const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const showPasswordCheckbox = document.getElementById('showPassword');
const errorMsg = document.getElementById('errorMsg');

// 3. Handle 'Show Password' Toggle
showPasswordCheckbox.addEventListener('change', function() {
    if (this.checked) {
        passwordInput.type = "text";
    } else {
        passwordInput.type = "password";
    }
});

// 4. Handle Login Button Click
loginBtn.addEventListener('click', (e) => {
    e.preventDefault(); 
    errorMsg.style.display = 'none'; // Hide old errors
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if(!email || !password) {
        errorMsg.innerText = "Please enter both email and password.";
        errorMsg.style.display = 'block';
        return;
    }

    // Show a simple loading state on the button
    const originalText = loginBtn.innerText;
    loginBtn.innerText = "Logging in...";
    loginBtn.disabled = true;

    // 5. Ask Firebase to authenticate
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Success! Redirect to your dashboard page
            console.log("Logged in successfully:", userCredential.user);
            
            // Optional: You can keep localStorage if your other pages check for it
            localStorage.setItem("isLoggedIn", "true");
            
            window.location.href = "index.html"; 
        })
        .catch((error) => {
            // Failed! Show error message
            console.error("Login Error:", error);
            loginBtn.innerText = originalText;
            loginBtn.disabled = false;
            
            // Catch common invalid credential errors
            if(error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                errorMsg.innerText = "Invalid email or password.";
            } else if (error.code === 'auth/invalid-email') {
                errorMsg.innerText = "Please enter a valid email format.";
            } else {
                errorMsg.innerText = "Error: " + error.message;
            }
            errorMsg.style.display = 'block';
        });
});