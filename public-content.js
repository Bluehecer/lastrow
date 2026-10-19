import { db, isFirebaseConfigured } from "./firebase-client.js";
import { collection, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

function appendCard(container, className, title, body, imageUrl) {
    const card = document.createElement("article");
    card.className = className;
    if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = title;
        image.loading = "lazy";
        card.append(image);
    }
    const heading = document.createElement("h3");
    heading.textContent = title || "Untitled";
    card.append(heading);
    if (body) {
        const description = document.createElement("p");
        description.textContent = body;
        card.append(description);
    }
    container.append(card);
}

function listen(collectionName, callback) {
    if (!isFirebaseConfigured) return;
    onSnapshot(query(collection(db, collectionName), orderBy("createdAt", "desc")), callback, (error) => {
        console.error(`Could not load public ${collectionName}.`, error);
    });
}

const products = document.querySelector("#products-from-store");
if (products) {
    listen("products", (snapshot) => {
        products.replaceChildren();
        for (const item of snapshot.docs) {
            const record = item.data();
            const card = document.createElement("article");
            card.className = "product-item";
            if (record.imageUrl) {
                const image = document.createElement("img");
                image.src = record.imageUrl;
                image.alt = record.title || "";
                image.loading = "lazy";
                card.append(image);
            }
            const heading = document.createElement("h2");
            heading.textContent = record.title || "Untitled";
            card.append(heading);
            if (record.price) {
                const price = document.createElement("p");
                price.textContent = record.price;
                card.append(price);
            }
            products.append(card);
        }
    });
}

const news = document.querySelector("#news-from-store");
if (news) {
    listen("news", (snapshot) => {
        news.closest(".store-feed").hidden = snapshot.empty;
        news.replaceChildren();
        for (const item of snapshot.docs) {
            const record = item.data();
            const article = document.createElement("article");
            article.className = "store-news-item";
            if (record.imageUrl) {
                const image = document.createElement("img");
                image.src = record.imageUrl;
                image.alt = record.title || "";
                image.loading = "lazy";
                article.append(image);
            }
            if (record.topic) {
                const topic = document.createElement("p");
                topic.className = "store-topic-label";
                topic.textContent = record.topic;
                article.append(topic);
            }
            const heading = document.createElement("h3");
            heading.textContent = record.title || "Untitled";
            article.append(heading);
            const body = document.createElement("p");
            body.textContent = record.body || "";
            article.append(body);
            news.append(article);
        }
    });
}

const photos = document.querySelector("#photos-from-store");
if (photos) {
    listen("photos", (snapshot) => {
        photos.closest(".store-feed").hidden = snapshot.empty;
        photos.replaceChildren();
        for (const item of snapshot.docs) {
            const record = item.data();
            appendCard(photos, "store-photo-item", record.title, "", record.imageUrl);
        }
    });
}

const topics = document.querySelector("#topics-from-store");
if (topics) {
    listen("topics", (snapshot) => {
        topics.closest(".store-feed").hidden = snapshot.empty;
        topics.replaceChildren();
        for (const item of snapshot.docs) {
            const record = item.data();
            appendCard(topics, "store-topic-item", record.title, record.body, "");
        }
    });
}
