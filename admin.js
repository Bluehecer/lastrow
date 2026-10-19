import { adminEmails } from "./firebase-config.js";
import { auth, db, isFirebaseConfigured, storage } from "./firebase-client.js";
import {
    onAuthStateChanged,
    reload,
    sendEmailVerification,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
    deleteObject,
    getDownloadURL,
    ref,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const status = document.querySelector("#portal-status");
const loginForm = document.querySelector("#login-form");
const workspace = document.querySelector("#portal-workspace");
const verificationPanel = document.querySelector("#verification-panel");
const signOutButton = document.querySelector("#sign-out");
const signedInAs = document.querySelector("#signed-in-as");
const maxImageSize = 8 * 1024 * 1024;
const validImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const listeners = [];

function stopContentListeners() {
    while (listeners.length) listeners.pop()();
}

function showStatus(message, kind = "info") {
    status.textContent = message;
    status.dataset.kind = kind;
}

function firebaseErrorMessage(error, action) {
    const code = error?.code || "unknown";
    const help = {
        "auth/too-many-requests": "Firebase temporarily blocked repeated requests. Wait a while, then try again.",
        "auth/operation-not-allowed": "Email/password authentication is not enabled in Firebase Authentication.",
        "auth/unauthorized-continue-uri": "The portal domain is not authorized in Firebase Authentication settings.",
        "auth/invalid-continue-uri": "The verification email action URL is invalid. Check Firebase Authentication email templates.",
        "auth/network-request-failed": "Check your internet connection and try again.",
        "auth/user-disabled": "This Firebase account is disabled."
    };
    return `${action} failed (${code}). ${help[code] || error?.message || "Check Firebase Authentication settings and try again."}`;
}

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function displayDate(timestamp) {
    if (!timestamp?.toDate) return "";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp.toDate());
}

function renderRecords(collectionName, snapshot) {
    const container = document.querySelector(`#records-${collectionName}`);
    container.replaceChildren();
    if (snapshot.empty) {
        const empty = document.createElement("p");
        empty.className = "portal-empty";
        empty.textContent = "Nothing added yet.";
        container.append(empty);
        return;
    }

    for (const item of snapshot.docs) {
        const record = item.data();
        const card = document.createElement("article");
        card.className = "portal-record";
        const image = record.imageUrl
            ? `<img src="${escapeHtml(record.imageUrl)}" alt="" loading="lazy">`
            : "";
        const description = record.body || record.price || record.topic || "";
        card.innerHTML = `
            ${image}
            <div class="portal-record-copy">
                <strong>${escapeHtml(record.title || "Untitled")}</strong>
                ${description ? `<span>${escapeHtml(description)}</span>` : ""}
                <small>${escapeHtml(displayDate(record.createdAt))}</small>
            </div>
            <button class="portal-delete-button" type="button" aria-label="Delete ${escapeHtml(record.title || "item")}">Delete</button>
        `;
        card.querySelector("button").addEventListener("click", () => removeRecord(collectionName, item.id, record));
        container.append(card);
    }
}

async function removeRecord(collectionName, recordId, record) {
    if (!window.confirm(`Delete “${record.title || "this item"}”?`)) return;
    try {
        await deleteDoc(doc(db, collectionName, recordId));
        if (record.storagePath) {
            try {
                await deleteObject(ref(storage, record.storagePath));
            } catch (error) {
                console.error("The record was deleted, but its image could not be removed.", error);
                showStatus("The item was deleted, but its image could not be removed from storage.", "error");
                return;
            }
        }
        showStatus("Item deleted.", "success");
    } catch (error) {
        console.error("Could not delete item.", error);
        showStatus(error.message || "Could not delete this item.", "error");
    }
}

async function showAuthorizedWorkspace(user) {
    const allowedEmails = adminEmails.map((email) => email.toLowerCase());
    if (!allowedEmails.includes(user.email?.toLowerCase())) {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Could not sign out unauthorized account.", error);
            showStatus(firebaseErrorMessage(error, "Signing out"), "error");
            return;
        }
        showStatus("This account is not on the admin email allowlist. Add its email to firebase-config.js and both Firebase security rules.", "error");
        return;
    }

    verificationPanel.hidden = true;
    loginForm.hidden = true;
    workspace.hidden = false;
    signOutButton.hidden = false;
    signedInAs.textContent = `Signed in as ${user.email || "admin"}`;
    showStatus("Signed in. Your content syncs with the live store.", "success");
    if (!listeners.length) startContentListeners();
}

function refreshTopicOptions(snapshot) {
    const options = snapshot.docs.map((item) => item.data().title).filter(Boolean);
    for (const select of document.querySelectorAll(".portal-topic-options")) {
        const selected = select.value;
        select.replaceChildren(new Option("No topic", ""));
        for (const topic of options) select.add(new Option(topic, topic));
        if (options.includes(selected)) select.value = selected;
    }
}

function startContentListeners() {
    for (const name of ["products", "news", "photos", "topics"]) {
        const contentQuery = query(collection(db, name), orderBy("createdAt", "desc"));
        listeners.push(onSnapshot(contentQuery, (snapshot) => {
            renderRecords(name, snapshot);
            if (name === "topics") refreshTopicOptions(snapshot);
        }, (error) => {
            console.error(`Could not read ${name}.`, error);
            showStatus(`Could not load ${name}. Check the Firebase security rules.`, "error");
        }));
    }
}

async function uploadImage(file, collectionName, user) {
    if (!file || !file.name) return {};
    if (!validImageTypes.has(file.type)) throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
    if (file.size > maxImageSize) throw new Error("Images must be 8 MB or smaller.");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `store/${collectionName}/${user.uid}/${crypto.randomUUID()}-${safeName}`;
    const imageRef = ref(storage, storagePath);
    await uploadBytes(imageRef, file, { contentType: file.type });
    return { imageUrl: await getDownloadURL(imageRef), storagePath };
}

for (const form of document.querySelectorAll(".portal-form")) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const user = auth?.currentUser;
        if (!user) {
            showStatus("Sign in before adding content.", "error");
            return;
        }

        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        let uploadedImage;
        try {
            const formData = new FormData(form);
            const collectionName = form.dataset.collection;
            const image = formData.get("image");
            const values = {
                title: String(formData.get("title") || "").trim(),
                createdAt: serverTimestamp(),
                createdBy: user.uid
            };

            if (collectionName === "products") {
                const price = String(formData.get("price") || "").trim();
                if (price) values.price = price;
            }
            if (collectionName === "news") {
                values.body = String(formData.get("body") || "").trim();
                const topic = String(formData.get("topic") || "").trim();
                if (topic) values.topic = topic;
            }
            if (collectionName === "topics") {
                values.body = String(formData.get("body") || "").trim();
            }
            uploadedImage = await uploadImage(image, collectionName, user);
            Object.assign(values, uploadedImage);
            await addDoc(collection(db, collectionName), values);
            form.reset();
            showStatus("Content saved.", "success");
        } catch (error) {
            if (uploadedImage?.storagePath) {
                try {
                    await deleteObject(ref(storage, uploadedImage.storagePath));
                } catch (cleanupError) {
                    console.error("Could not clean up an image after the save failed.", cleanupError);
                }
            }
            console.error("Could not save content.", error);
            showStatus(error.message || "Could not save content. Check your Firebase setup and rules.", "error");
        } finally {
            submitButton.disabled = false;
        }
    });
}

for (const tab of document.querySelectorAll(".portal-tab")) {
    tab.addEventListener("click", () => {
        for (const otherTab of document.querySelectorAll(".portal-tab")) {
            const active = otherTab === tab;
            otherTab.classList.toggle("is-active", active);
            otherTab.setAttribute("aria-selected", String(active));
        }
        for (const panel of document.querySelectorAll(".portal-panel")) {
            panel.hidden = panel.id !== tab.dataset.panel;
        }
    });
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    const button = loginForm.querySelector('[type="submit"]');
    button.disabled = true;
    showStatus("Signing in…");
    try {
        await signInWithEmailAndPassword(auth, String(data.get("email")).trim(), String(data.get("password")));
    } catch (error) {
        console.error("Sign in failed.", error);
        showStatus("Sign-in failed. Check your email and password, and confirm the account exists in Firebase Authentication.", "error");
    } finally {
        button.disabled = false;
    }
});

signOutButton.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign out failed.", error);
        showStatus(error.message || "Could not sign out.", "error");
    }
});

document.querySelector("#resend-verification").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Sign in again before requesting a verification email.");
        await sendEmailVerification(user);
        showStatus(`Verification email sent to ${user.email}. Check your inbox and spam folder.`, "success");
    } catch (error) {
        console.error("Could not send email verification.", error);
        showStatus(firebaseErrorMessage(error, "Sending verification email"), "error");
    } finally {
        button.disabled = false;
    }
});

document.querySelector("#check-verification").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Your sign-in expired. Sign in again after verifying your email.");
        await reload(user);
        if (!user.emailVerified) {
            showStatus("Firebase still reports this email as unverified. Open the latest verification link, then check again.", "error");
            return;
        }
        await user.getIdToken(true);
        await showAuthorizedWorkspace(user);
    } catch (error) {
        console.error("Could not check email verification.", error);
        showStatus(firebaseErrorMessage(error, "Checking email verification"), "error");
    } finally {
        button.disabled = false;
    }
});

if (!isFirebaseConfigured) {
    showStatus("Firebase is not configured yet. Add your Firebase web app details to firebase-config.js, then deploy again.", "error");
} else {
    onAuthStateChanged(auth, async (user) => {
        if (user && !user.emailVerified) {
            loginForm.hidden = true;
            workspace.hidden = true;
            verificationPanel.hidden = false;
            signOutButton.hidden = false;
            showStatus(`Signed in as ${user.email || "this account"}, but its email is not verified.`, "error");
            return;
        }

        if (user) {
            await showAuthorizedWorkspace(user);
        } else {
            loginForm.hidden = false;
            workspace.hidden = true;
            verificationPanel.hidden = true;
            signOutButton.hidden = true;
            stopContentListeners();
            showStatus("Sign in with an authorized store admin account.");
        }
    }, (error) => {
        console.error("Firebase authentication failed.", error);
        showStatus("Could not connect to Firebase Authentication. Check your Firebase configuration.", "error");
    });
}
