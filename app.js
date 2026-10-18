import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================================
// 1. إعدادات فايربيس والثوابت الأساسية
// ============================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBtj65b-J9L7Oxf3iR1EE5tinF5FahVLpw",
    authDomain: "hujariya-1.firebaseapp.com",
    projectId: "hujariya-1",
    storageBucket: "hujariya-1.firebasestorage.app",
    messagingSenderId: "983562756581",
    appId: "1:983562756581:web:71ede7b120b50af894cf0c",
    measurementId: "G-ZE0H1NV0X5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const IMGBB_API_KEY = "E9d57b2ba79217bb8bde762b332b7c62".trim().toLowerCase();
const ADMIN_EMAILS = ["rawialshamal@gmail.com", "a1hmedrashad@gmail.com"];

const $ = (id) => document.getElementById(id);

function isUserAdmin(user) {
    return Boolean(user && user.email && ADMIN_EMAILS.includes(user.email.trim().toLowerCase()));
}

// حالة النظام الشاملة
let currentUser = null;
let isAdmin = false;
let allBooks = [];
let allReviews = [];
let allAuthors = [];
let allPublishers = [];
let allReports = [];
let allAuditLogs = [];
let bookOverrides = {};
let userFavorites = [];

let activeCategory = "all";
let activeEra = "all";
let activeMyUploadsFilter = "all";

// ذاكرة سلوك القارئ لخوارزمية الذكاء الاصطناعي العميقة
let aiProfile = JSON.parse(localStorage.getItem("hujariya_ai_profile") || '{"categories":{},"authors":{},"eras":{},"queries":[]}');

function saveAiInteraction(type, value, weight = 1) {
    if (!value) return;
    if (type === "query") {
        const cleanQ = value.trim();
        if (cleanQ.length > 2 && !aiProfile.queries.includes(cleanQ)) {
            aiProfile.queries.unshift(cleanQ);
            aiProfile.queries = aiProfile.queries.slice(0, 12);
        }
    } else if (aiProfile[type]) {
        aiProfile[type][value] = (aiProfile[type][value] || 0) + weight;
    }
    localStorage.setItem("hujariya_ai_profile", JSON.stringify(aiProfile));
}

// ============================================================================
// 2. دوال مساعدة: تطبيع النص، ضغط الصور السريع، وروابط درايف، والأرشفة SEO
// ============================================================================
function normalizeArabic(text) {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/[\u064B-\u065F]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/^(ال|روايه|رواية|كتاب|ديوان|مؤلف)\s+/g, "")
        .replace(/\s+/g, " ");
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, s => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
}

// ضغط الصور في المتصفح قبل رفعها لـ ImgBB لجعل الرفع فوري وخفيف جداً
async function compressAndUploadImage(file, maxWidth = 850, quality = 0.78) {
    const compressedBlob = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = Math.round((h * maxWidth) / w);
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });

    const fd = new FormData();
    fd.append("image", compressedBlob, "hujariya_upload.jpg");
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: fd
    });
    const data = await res.json();
    if (!data.success) throw new Error("فشل رفع الصورة");
    return data.data.url;
}

function extractDriveFileId(url) {
    if (!url) return null;
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    return m && m[1] ? m[1] : null;
}

function toDirectDriveDownload(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

function toEmbedDrivePreview(url) {
    const id = extractDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/preview` : url;
}

// تحديث بيانات محركات البحث (Google SEO & Schema.org JSON-LD) ديناميكياً
function updateDynamicSeo(book = null, author = null) {
    const schemaScript = $("dynamicJsonLd");
    if (!schemaScript) return;

    if (book) {
        document.title = `${book.title} - ${book.author} | موسوعة الحجرية الوطنية`;
        schemaScript.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Book",
            "name": book.title,
            "author": { "@type": "Person", "name": book.author },
            "publisher": book.publisher ? { "@type": "Organization", "name": book.publisher } : undefined,
            "description": book.description,
            "image": book.coverUrl,
            "inLanguage": "ar",
            "genre": book.category
        });
    } else if (author) {
        document.title = `المؤلف ${author.name} | موسوعة الحجرية الوطنية`;
        schemaScript.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            "name": author.name,
            "description": author.bio,
            "image": author.photoUrl
        });
    } else {
        document.title = "موسوعة الحجرية | المكتبة الوطنية لتوثيق المؤلفات والكتّاب اليمنيين";
    }
}

// تسجيل سجل الشفافية (Audit Trail)
async function recordAuditLog(actionTitle, detailsText) {
    if (!currentUser) return;
    try {
        await addDoc(collection(db, "reviews"), {
            recordType: "audit",
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            actionTitle,
            detailsText,
            createdAt: Date.now()
        });
    } catch (e) {}
}

// ============================================================================
// 3. إدارة الوضع الليلي والنهاري والتنقل السلس
// ============================================================================
function applyThemeMode(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("light-mode", !isDark);
    if ($("darkModeToggle")) $("darkModeToggle").checked = isDark;
    localStorage.setItem("hujariya_theme", isDark ? "dark" : "light");
}

applyThemeMode(localStorage.getItem("hujariya_theme") === "dark");

if ($("darkModeToggle")) {
    $("darkModeToggle").addEventListener("change", (e) => applyThemeMode(e.target.checked));
}
if ($("quickThemeToggle")) {
    $("quickThemeToggle").addEventListener("click", () => applyThemeMode(!document.body.classList.contains("dark-mode")));
}

function navigateToPage(targetId) {
    document.querySelectorAll(".samsung-nav-item[data-target]").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-target") === targetId);
    });
    document.querySelectorAll(".view-page").forEach(page => {
        page.classList.toggle("active-page", page.id === targetId);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    updateDynamicSeo();
}

document.querySelectorAll(".samsung-nav-item[data-target]").forEach(btn => {
    btn.addEventListener("click", () => navigateToPage(btn.getAttribute("data-target")));
});

if ($("brandHomeTrigger")) {
    $("brandHomeTrigger").addEventListener("click", () => navigateToPage("shelvesView"));
}

// التبويبات الفرعية في دليل المؤلفين ودور النشر
if ($("showAuthorsDirBtn") && $("showPublishersDirBtn")) {
    $("showAuthorsDirBtn").addEventListener("click", () => {
        $("showAuthorsDirBtn").classList.add("active");
        $("showPublishersDirBtn").classList.remove("active");
        $("authorsDirectoryContainer").style.display = "block";
        $("publishersDirectoryContainer").style.display = "none";
    });
    $("showPublishersDirBtn").addEventListener("click", () => {
        $("showPublishersDirBtn").classList.add("active");
        $("showAuthorsDirBtn").classList.remove("active");
        $("publishersDirectoryContainer").style.display = "block";
        $("authorsDirectoryContainer").style.display = "none";
    });
}

// التبويبات الفرعية في مكتبتي
document.querySelectorAll("[data-mylib]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-mylib]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.getAttribute("data-mylib");
        document.querySelectorAll(".mylib-subpart").forEach(part => {
            part.style.display = part.id === target ? "block" : "none";
        });
    });
});

// التبويبات الفرعية في لوحة الإدارة
document.querySelectorAll("[data-admintab]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("[data-admintab]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.getAttribute("data-admintab");
        document.querySelectorAll(".admin-subview").forEach(sub => {
            sub.style.display = sub.id === target ? "block" : "none";
        });
    });
});

// إغلاق النوافذ المنبثقة عند الضغط على الخلفية
document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
            if (modal.id === "pdfReaderModal" && $("pdfViewerFrame")) {
                $("pdfViewerFrame").src = "";
            }
        }
    });
});

// ============================================================================
// 4. نظام المصادقة، حساب المستخدم، وأوسمة الشرف التحفيزية
// ============================================================================
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    isAdmin = isUserAdmin(user);

    const authBtn = $("authActionBtn");
    if (user) {
        authBtn.innerHTML = `<i class="ri-logout-box-r-line"></i><span>تسجيل الخروج</span>`;
        authBtn.style.background = "var(--danger)";
        $("profileName").textContent = isAdmin ? `${user.displayName} (الإدارة العليا)` : user.displayName;
        $("profileEmail").textContent = user.email;
        $("profileAvatar").src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "U")}&background=182e29&color=c28e48`;

        $("adminBadgeIcon").style.display = isAdmin ? "flex" : "none";
        $("adminNavBtn").style.display = isAdmin ? "flex" : "none";

        await loadUserFavorites(user.uid);
    } else {
        authBtn.innerHTML = `<i class="ri-google-fill"></i><span>تسجيل الدخول عبر جوجل</span>`;
        authBtn.style.background = "";
        $("profileName").textContent = "زائر الموسوعة";
        $("profileEmail").textContent = "سجل دخولك للمساهمة في توثيق الكتب والحصول على أوسمة الشرف الثقافية";
        $("profileAvatar").src = "https://ui-avatars.com/api/?name=H&background=182e29&color=c28e48";

        $("adminBadgeIcon").style.display = "none";
        $("adminNavBtn").style.display = "none";
        $("userContributorBadgeBox").style.display = "none";
        userFavorites = [];
    }
    renderAllViews();
});

if ($("authActionBtn")) {
    $("authActionBtn").addEventListener("click", () => {
        if (currentUser) {
            signOut(auth);
        } else {
            signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
                alert("يرجى التأكد من تفعيل Google في قسم Authentication بفايربيس وإضافة النطاق في Authorized domains.");
                console.error(err);
            });
        }
    });
}

async function loadUserFavorites(uid) {
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            userFavorites = snap.data().favorites || [];
        } else {
            await setDoc(ref, {
                name: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL || "",
                favorites: []
            });
            userFavorites = [];
        }
    } catch (e) {
        console.error(e);
    }
}

function getContributorRank(count) {
    if (count >= 15) return { title: "وسام حارس التراث اليمني", icon: "ri-vip-crown-fill" };
    if (count >= 7) return { title: "وسام موثق الحجرية الذهبي", icon: "ri-medal-fill" };
    if (count >= 3) return { title: "وسام باحث وموثق وطني", icon: "ri-award-fill" };
    if (count >= 1) return { title: "وسام مساهم ثقافي", icon: "ri-quill-pen-fill" };
    return { title: "قارئ ومشارك", icon: "ri-user-star-line" };
}

function updateUserGamificationBadge() {
    const box = $("userContributorBadgeBox");
    if (!currentUser || !box) return;
    const myPublishedCount = allBooks.filter(b =>
        b.addedByUid === currentUser.uid &&
        (b.status === "published_full" || b.status === "published_no_download")
    ).length;
    const rank = getContributorRank(myPublishedCount);
    box.style.display = "inline-flex";
    box.innerHTML = `<i class="${rank.icon}"></i><span>${rank.title} (${myPublishedCount} مؤلف موثق)</span>`;
}

// ============================================================================
// 5. جلب ومعالجة البيانات الشاملة من Firestore
// ============================================================================
async function fetchAllEncyclopediaData() {
    try {
        const [booksSnap, recordsSnap] = await Promise.all([
            getDocs(collection(db, "books")),
            getDocs(collection(db, "reviews"))
        ]);

        allReviews = [];
        allAuthors = [];
        allPublishers = [];
        allReports = [];
        allAuditLogs = [];
        bookOverrides = {};

        recordsSnap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            const type = data.recordType || "review";
            if (type === "author") allAuthors.push(data);
            else if (type === "publisher") allPublishers.push(data);
            else if (type === "report") allReports.push(data);
            else if (type === "audit") allAuditLogs.push(data);
            else if (type === "book_override") {
                if (!bookOverrides[data.bookId] || data.createdAt > bookOverrides[data.bookId].createdAt) {
                    bookOverrides[data.bookId] = data;
                }
            } else {
                allReviews.push(data);
            }
        });

        const rawBooks = [];
        booksSnap.forEach(d => {
            const data = d.data();
            if (!data.isConfigDoc) {
                const bookObj = { id: d.id, ...data };
                // دمج أي تعديل مقدم من المساهم أو دار النشر
                if (bookOverrides[d.id]) {
                    const ov = bookOverrides[d.id];
                    Object.assign(bookObj, ov.updatedFields, { overrideDocId: ov.id });
                }
                rawBooks.push(bookObj);
            }
        });

        allBooks = rawBooks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        allReports.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        allAuditLogs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        syncImplicitAuthorsAndPublishers();
        populateDatalists();
        renderAllViews();
    } catch (err) {
        console.error("خطأ في جلب بيانات الموسوعة:", err);
    }
}

// توليد بطاقات المؤلفين ودور النشر تلقائياً حتى للكتب المرفوعة سابقاً
function syncImplicitAuthorsAndPublishers() {
    const knownAuthorNames = new Set(allAuthors.map(a => normalizeArabic(a.name)));
    allBooks.forEach(b => {
        const normA = normalizeArabic(b.author);
        if (normA && !knownAuthorNames.has(normA)) {
            knownAuthorNames.add(normA);
            allAuthors.push({
                id: "implicit_" + normA,
                isImplicit: true,
                name: b.author,
                bio: b.authorBio || "مؤلف وكاتب يمني موثق في أرشيف موسوعة الحجرية الوطنية.",
                photoUrl: b.authorPhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.author)}&background=182e29&color=c28e48&size=200`,
                userId: b.addedByUid || "",
                userName: b.addedByName || "موسوعة الحجرية"
            });
        }
    });

    const knownPubNames = new Set(allPublishers.map(p => normalizeArabic(p.name)));
    allBooks.forEach(b => {
        if (b.publisher) {
            const normP = normalizeArabic(b.publisher);
            if (normP && !knownPubNames.has(normP)) {
                knownPubNames.add(normP);
                allPublishers.push({
                    id: "implicit_pub_" + normP,
                    isImplicit: true,
                    name: b.publisher,
                    city: b.cityYear || "اليمن",
                    bio: "دار نشر يمنية مدرجة ضمن الإصدارات الموثقة في الموسوعة.",
                    verified: false,
                    status: "approved",
                    userId: b.addedByUid || ""
                });
            }
        }
    });
}

function populateDatalists() {
    const authList = $("existingAuthorsDatalist");
    if (authList) {
        authList.innerHTML = allAuthors.map(a => `<option value="${escapeHtml(a.name)}">`).join("");
    }
    const pubList = $("existingPublishersDatalist");
    if (pubList) {
        pubList.innerHTML = allPublishers
            .filter(p => p.status !== "rejected")
            .map(p => `<option value="${escapeHtml(p.name)}">`).join("");
    }
}

// ============================================================================
// 6. عرض الواجهات، الإحصائيات، البحث الذكي، الخط الزمني، والذكاء الاصطناعي
// ============================================================================
function renderAllViews() {
    updateNationalStatistics();
    updateUserGamificationBadge();
    renderMainBookshelf();
    renderDeepAiRecommendations();
    renderAuthorsAndPublishersDirectory();
    if (currentUser) renderMyLibraryView();
    if (isAdmin) renderAdminDashboard();
}

function updateNationalStatistics() {
    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    const uniqueAuthors = new Set(published.map(b => normalizeArabic(b.author)).filter(Boolean));
    const uniquePubs = new Set([
        ...allPublishers.filter(p => p.verified || p.status === "approved").map(p => normalizeArabic(p.name)),
        ...published.map(b => normalizeArabic(b.publisher)).filter(Boolean)
    ]);

    if ($("statBooksCount")) $("statBooksCount").textContent = published.length;
    if ($("statAuthorsCount")) $("statAuthorsCount").textContent = Math.max(uniqueAuthors.size, allAuthors.length);
    if ($("statPublishersCount")) $("statPublishersCount").textContent = uniquePubs.size;
    if ($("statReviewsCount")) $("statReviewsCount").textContent = allReviews.length;
}

// البحث الذكي الفوري
if ($("searchInput")) {
    $("searchInput").addEventListener("input", (e) => {
        const val = e.target.value;
        $("clearSearchBtn").style.display = val ? "flex" : "none";
        if (val.trim().length > 2) saveAiInteraction("query", val.trim());
        renderMainBookshelf();
    });
}

if ($("clearSearchBtn")) {
    $("clearSearchBtn").addEventListener("click", () => {
        $("searchInput").value = "";
        $("clearSearchBtn").style.display = "none";
        renderMainBookshelf();
    });
}

// تبويبات التصنيفات
document.querySelectorAll(".cat-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".cat-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        activeCategory = chip.getAttribute("data-cat");
        if (activeCategory !== "all") saveAiInteraction("categories", activeCategory, 1);
        chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        renderMainBookshelf();
    });
});

// الخط الزمني الأدبي
document.querySelectorAll("#timelineFilterBar .era-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#timelineFilterBar .era-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeEra = pill.getAttribute("data-era");
        if (activeEra !== "all") saveAiInteraction("eras", activeEra, 1);
        renderMainBookshelf();
    });
});

function renderMainBookshelf() {
    const q = ($("searchInput")?.value || "").trim().toLowerCase();
    const grid = $("mainBookshelf");
    if (!grid) return;
    grid.innerHTML = "";

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    const filtered = published.filter(b => {
        const matchQuery = !q ||
            (b.title || "").toLowerCase().includes(q) ||
            (b.author || "").toLowerCase().includes(q) ||
            (b.publisher || "").toLowerCase().includes(q) ||
            (b.cityYear || "").toLowerCase().includes(q) ||
            (b.description || "").toLowerCase().includes(q);

        const matchCat = activeCategory === "all" ||
            (activeCategory === "صوت المؤلف" ? Boolean(b.audioUrl) : b.category === activeCategory);

        const matchEra = activeEra === "all" || (b.era || "الألفية الحديثة") === activeEra;

        return matchQuery && matchCat && matchEra;
    });

    if ($("shownBooksCount")) $("shownBooksCount").textContent = `${filtered.length} كتاب`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:48px 20px; background:var(--bg-surface); border-radius:16px; border:1.5px dashed var(--border-color);">
                <i class="ri-book-open-line" style="font-size:2.8rem; color:var(--hujariya-gold);"></i>
                <h4 style="margin:10px 0 4px;">لا توجد مؤلفات مطابقة في هذا الرف حالياً</h4>
                <p style="font-size:0.86rem; color:var(--text-muted);">اضغط على «نشر كتاب» في الشريط السفلي لتوثيق أول مؤلف في هذا القسم!</p>
            </div>
        `;
        return;
    }

    filtered.forEach(book => grid.appendChild(createBookCard(book)));
}

function createBookCard(book, showModerationState = false) {
    const card = document.createElement("div");
    card.className = "book-card";

    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    let statusClass = "";
    let statusLabel = book.category;

    if (showModerationState) {
        if (book.status === "pending") { statusLabel = "⏳ قيد المراجعة"; statusClass = "st-pending"; }
        else if (book.status === "suspended") { statusLabel = "⚠️ معلق / مقيد"; statusClass = "st-suspended"; }
        else if (book.status === "rejected") { statusLabel = "❌ مرفوض"; statusClass = "st-rejected"; }
        else { statusLabel = "✅ تم القبول"; }
    }

    const contributorAvatar = book.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(book.addedByName || "م")}&background=182e29&color=c28e48`;

    card.innerHTML = `
        <div class="book-cover-wrap">
            <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" loading="lazy">
            <span class="book-status-tag ${statusClass}">${escapeHtml(statusLabel)}</span>
            ${book.audioUrl ? `<span class="audio-corner-badge" title="يحتوي على مقطع صوتي للمؤلف"><i class="ri-mic-fill"></i></span>` : ""}
        </div>
        <div class="book-card-body">
            <div class="book-card-title">${escapeHtml(book.title)}</div>
            <div class="book-card-author"><i class="ri-quill-pen-line"></i> ${escapeHtml(book.author)}</div>
            <div class="book-contributor-row" title="المساهم بتوثيق الكتاب">
                <img src="${escapeHtml(contributorAvatar)}" alt="المساهم">
                <span>مساهمة: ${escapeHtml(book.addedByName || "باحث وطني")}</span>
            </div>
            <div class="book-card-footer">
                <span class="rating-stars-chip"><i class="ri-star-fill"></i> ${avg}</span>
                <span style="color:${book.status === 'published_full' && book.downloadLink ? 'var(--success)' : 'var(--hujariya-gold)'};">
                    ${book.status === "published_full" && book.downloadLink
                        ? '<i class="ri-book-read-line"></i> قراءة وتحميل'
                        : '<i class="ri-discuss-line"></i> موسوعي'}
                </span>
            </div>
        </div>
    `;

    card.addEventListener("click", () => openBookDetails(book));
    return card;
}

// ============================================================================
// 7. خوارزمية الذكاء الاصطناعي العميقة لتوصية الكتب
// ============================================================================
function renderDeepAiRecommendations() {
    const section = $("aiRecommendationsSection");
    const grid = $("aiBooksGrid");
    const reasonEl = $("aiReasonSubtext");
    if (!section || !grid) return;

    const published = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");
    if (published.length < 2) {
        section.style.display = "none";
        return;
    }

    const favSet = new Set(userFavorites);
    const favBooks = published.filter(b => favSet.has(b.id));

    const hasUserSignals = favBooks.length > 0 ||
        Object.keys(aiProfile.categories).length > 0 ||
        Object.keys(aiProfile.authors).length > 0 ||
        aiProfile.queries.length > 0;

    if (!hasUserSignals) {
        section.style.display = "none";
        return;
    }

    const scored = published
        .filter(b => !favSet.has(b.id))
        .map(book => {
            let score = 0;
            const normAuth = normalizeArabic(book.author);
            score += (aiProfile.categories[book.category] || 0) * 3;
            score += (aiProfile.authors[normAuth] || 0) * 5;
            score += (aiProfile.eras[book.era] || 0) * 2;

            favBooks.forEach(fb => {
                if (fb.category === book.category) score += 4;
                if (normalizeArabic(fb.author) === normAuth) score += 6;
            });

            aiProfile.queries.forEach(q => {
                const ql = q.toLowerCase();
                if ((book.title || "").toLowerCase().includes(ql) || (book.author || "").toLowerCase().includes(ql)) {
                    score += 5;
                }
            });

            score += (book.ratingCount || 0) * 0.5;
            return { book, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

    if (scored.length === 0) {
        section.style.display = "none";
        return;
    }

    const topCategory = Object.entries(aiProfile.categories).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (reasonEl && topCategory) {
        reasonEl.textContent = `مختارات ذكية مخصصة لك لاهتمامك بـ «${topCategory}» والمؤلفين المرتبطين`;
    }

    section.style.display = "block";
    grid.innerHTML = "";
    scored.forEach(item => grid.appendChild(createBookCard(item.book)));
}

// ============================================================================
// 8. دليل المؤلفين، السير الذاتية، وتوثيق دور النشر اليمنية
// ============================================================================
function renderAuthorsAndPublishersDirectory() {
    const authorsGrid = $("authorsGridList");
    const pubsGrid = $("publishersGridList");
    if (!authorsGrid || !pubsGrid) return;

    authorsGrid.innerHTML = "";
    pubsGrid.innerHTML = "";

    const publishedBooks = allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download");

    if (allAuthors.length === 0) {
        authorsGrid.innerHTML = `<p style="color:var(--text-muted);">لا يوجد مؤلفون مسجلون بعد.</p>`;
    } else {
        allAuthors.forEach(author => {
            const normName = normalizeArabic(author.name);
            const authorBooksCount = publishedBooks.filter(b => normalizeArabic(b.author) === normName).length;
            const photo = author.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(author.name)}&background=182e29&color=c28e48`;

            const card = document.createElement("div");
            card.className = "entity-card";
            card.innerHTML = `
                <img src="${escapeHtml(photo)}" class="entity-avatar" alt="${escapeHtml(author.name)}">
                <div class="entity-info">
                    <h4>${escapeHtml(author.name)} <i class="ri-quill-pen-fill verified-badge"></i></h4>
                    <div class="entity-bio">${escapeHtml(author.bio || "كاتب ومؤلف يمني")}</div>
                    <span class="gold-pill-badge" style="padding:2px 10px; font-size:0.72rem;">${authorBooksCount} مؤلف في الموسوعة</span>
                </div>
            `;
            card.addEventListener("click", () => openAuthorProfileModal(author.name));
            authorsGrid.appendChild(card);
        });
    }

    const visiblePubs = allPublishers.filter(p => p.status !== "rejected");
    if (visiblePubs.length === 0) {
        pubsGrid.innerHTML = `<p style="color:var(--text-muted);">لم يتم تسجيل دور نشر بعد.</p>`;
    } else {
        visiblePubs.forEach(pub => {
            const normP = normalizeArabic(pub.name);
            const pubBooksCount = publishedBooks.filter(b => normalizeArabic(b.publisher) === normP).length;
            const logo = pub.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(pub.name)}&background=c28e48&color=fff`;

            const card = document.createElement("div");
            card.className = "entity-card";
            card.innerHTML = `
                <img src="${escapeHtml(logo)}" class="entity-avatar" alt="${escapeHtml(pub.name)}">
                <div class="entity-info">
                    <h4>
                        ${escapeHtml(pub.name)}
                        ${pub.verified ? `<i class="ri-verified-badge-fill verified-badge" title="دار نشر يمنية موثقة"></i>` : ""}
                    </h4>
                    <div class="entity-bio">${escapeHtml(pub.bio || pub.city || "دار نشر يمنية")}</div>
                    <span class="gold-pill-badge" style="padding:2px 10px; font-size:0.72rem;">
                        ${pub.verified ? "دار موثقة رسمياً" : "مسجلة"} • ${pubBooksCount} إصدار
                    </span>
                </div>
            `;
            card.addEventListener("click", () => {
                $("searchInput").value = pub.name;
                $("clearSearchBtn").style.display = "flex";
                navigateToPage("shelvesView");
                renderMainBookshelf();
            });
            pubsGrid.appendChild(card);
        });
    }
}

function openAuthorProfileModal(authorName) {
    const normTarget = normalizeArabic(authorName);
    let authorObj = allAuthors.find(a => normalizeArabic(a.name) === normTarget);
    if (!authorObj) {
        authorObj = {
            id: "implicit_" + normTarget,
            isImplicit: true,
            name: authorName,
            bio: "مؤلف وكاتب يمني موثق في موسوعة الحجرية الوطنية.",
            photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=182e29&color=c28e48`,
            userId: ""
        };
    }

    saveAiInteraction("authors", normTarget, 2);
    updateDynamicSeo(null, authorObj);

    const authorBooks = allBooks.filter(b =>
        normalizeArabic(b.author) === normTarget &&
        (b.status === "published_full" || b.status === "published_no_download")
    );

    const canEditAuthor = isAdmin || (currentUser && authorObj.userId && authorObj.userId === currentUser.uid);
    const photo = authorObj.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorObj.name)}&background=182e29&color=c28e48`;

    const body = $("authorProfileBody");
    body.innerHTML = `
        <div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap; background:var(--bg-main); padding:18px; border-radius:16px; border:1px solid var(--border-color); margin-bottom:20px;">
            <img src="${escapeHtml(photo)}" style="width:92px; height:92px; border-radius:50%; object-fit:cover; border:3px solid var(--hujariya-gold);">
            <div style="flex:1; min-width:200px;">
                <span class="gold-pill-badge">بطاقة مؤلف يمني</span>
                <h2 style="font-family:'Amiri',serif; font-size:1.55rem; margin:6px 0;">${escapeHtml(authorObj.name)}</h2>
                <p style="font-size:0.9rem; color:var(--text-main); line-height:1.7;">${escapeHtml(authorObj.bio)}</p>
                ${canEditAuthor ? `
                    <button type="button" id="editAuthorProfileBtn" class="btn-secondary-action" style="margin-top:10px; padding:6px 12px; font-size:0.8rem;">
                        <i class="ri-image-edit-line"></i> تحديث صورة الكاتب أو سيرته الذاتية
                    </button>
                ` : ""}
            </div>
        </div>

        <div class="section-header-bar">
            <div class="header-title-group">
                <i class="ri-book-shelf-line"></i>
                <h3>جميع مؤلفات «${escapeHtml(authorObj.name)}» (${authorBooks.length})</h3>
            </div>
        </div>
        <div id="authorModalBooksGrid" class="bookshelf-grid"></div>
    `;

    const grid = $("authorModalBooksGrid");
    if (authorBooks.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted);">لا توجد كتب منشورة لهذا المؤلف حالياً.</p>`;
    } else {
        authorBooks.forEach(b => {
            const c = createBookCard(b);
            c.addEventListener("click", () => {
                $("authorProfileModal").style.display = "none";
            });
            grid.appendChild(c);
        });
    }

    if (canEditAuthor && $("editAuthorProfileBtn")) {
        $("editAuthorProfileBtn").onclick = () => {
            $("authorProfileModal").style.display = "none";
            openAddOrEditAuthorModal(authorObj);
        };
    }

    $("authorProfileModal").style.display = "flex";
}

if ($("closeAuthorProfileModal")) {
    $("closeAuthorProfileModal").onclick = () => $("authorProfileModal").style.display = "none";
}

// نافذة إضافة أو تعديل كاتب
function openAddOrEditAuthorModal(existingAuthor = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول بحساب جوجل أولاً.");
        navigateToPage("profileView");
        return;
    }

    $("addEntityModalTitle").innerHTML = `<i class="ri-quill-pen-line"></i> ${existingAuthor ? "تحديث بطاقة المؤلف" : "إضافة كاتب يمني جديد"}`;
    $("addEntityModalBody").innerHTML = `
        <div class="form-field">
            <label>الاسم الكامل للمؤلف *</label>
            <input type="text" id="entityAuthorName" value="${escapeHtml(existingAuthor?.name || "")}" placeholder="مثال: الدكتور عبدالعزيز المقالح" ${existingAuthor && !existingAuthor.isImplicit ? "readonly" : ""}>
        </div>
        <div class="form-field">
            <label>نبذة وسيرة ذاتية عن المؤلف *</label>
            <textarea id="entityAuthorBio" rows="4" placeholder="اكتب نبذة وافية عن مسيرة الكاتب ومؤلفاته...">${escapeHtml(existingAuthor?.bio || "")}</textarea>
        </div>
        <div class="form-field">
            <label>صورة الكاتب (اختياري - يمكنك تخطيها أو إضافتها لاحقاً)</label>
            <input type="file" id="entityAuthorPhoto" accept="image/*">
        </div>
        <div id="entityStatusMsg" class="status-feedback-text"></div>
        <button type="button" id="saveAuthorEntityBtn" class="btn-primary-action w-100">
            <i class="ri-check-double-line"></i><span>حفظ بطاقة المؤلف</span>
        </button>
    `;

    $("saveAuthorEntityBtn").onclick = async () => {
        const name = $("entityAuthorName").value.trim();
        const bio = $("entityAuthorBio").value.trim();
        const file = $("entityAuthorPhoto").files[0];
        const msg = $("entityStatusMsg");
        const btn = $("saveAuthorEntityBtn");

        if (!name || !bio) {
            msg.style.color = "var(--danger)";
            msg.textContent = "يرجى إدخال اسم الكاتب والنبذة التعريفية.";
            return;
        }

        btn.disabled = true;
        msg.style.color = "var(--hujariya-gold)";
        msg.textContent = "جاري حفظ بيانات الكاتب...";

        try {
            let photoUrl = existingAuthor?.photoUrl || "";
            if (file) {
                photoUrl = await compressAndUploadImage(file, 500, 0.8);
            }

            if (existingAuthor && !existingAuthor.isImplicit) {
                await updateDoc(doc(db, "reviews", existingAuthor.id), {
                    name, bio, photoUrl, updatedAt: Date.now()
                });
            } else {
                await addDoc(collection(db, "reviews"), {
                    recordType: "author",
                    name,
                    bio,
                    photoUrl,
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });
            }

            await recordAuditLog("تحديث بيانات مؤلف", `المؤلف: ${name}`);
            await fetchAllEncyclopediaData();
            $("addEntityModal").style.display = "none";
            openAuthorProfileModal(name);
        } catch (e) {
            msg.style.color = "var(--danger)";
            msg.textContent = "حدث خطأ أثناء الحفظ، حاول مجدداً.";
            btn.disabled = false;
        }
    };

    $("addEntityModal").style.display = "flex";
}

if ($("openNewAuthorModalBtn")) {
    $("openNewAuthorModalBtn").addEventListener("click", () => openAddOrEditAuthorModal(null));
}
if ($("closeAddEntityModal")) {
    $("closeAddEntityModal").addEventListener("click", () => $("addEntityModal").style.display = "none");
}

// نافذة طلب توثيق دار نشر يمنية
if ($("openNewPublisherModalBtn")) {
    $("openNewPublisherModalBtn").addEventListener("click", () => {
        if (!currentUser) {
            alert("يرجى تسجيل الدخول بحساب جوجل الرسمي لدار النشر أولاً.");
            navigateToPage("profileView");
            return;
        }

        $("addEntityModalTitle").innerHTML = `<i class="ri-building-2-line"></i> طلب توثيق دار نشر يمنية`;
        $("addEntityModalBody").innerHTML = `
            <div class="guide-alert-box">
                <i class="ri-verified-badge-fill"></i>
                <span>تحصل دور النشر اليمنية الموثقة على الشارة الذهبية وصلاحية إدارة وتحديث بيانات إصداراتها في الموسوعة.</span>
            </div>
            <div class="form-field">
                <label>اسم دار النشر أو المؤسسة الثقافية *</label>
                <input type="text" id="pubNameInput" placeholder="مثال: دار صفقات كتابية">
            </div>
            <div class="form-field">
                <label>المقر / المدينة اليمنية *</label>
                <input type="text" id="pubCityInput" placeholder="مثال: تعز / صنعاء / عدن">
            </div>
            <div class="form-field">
                <label>الموقع الرسمي أو صفحة التواصل لإثبات الهوية اليمنية *</label>
                <input type="text" id="pubProofInput" placeholder="رابط الصفحة الرسمية أو رقم الترخيص...">
            </div>
            <div class="form-field">
                <label>نبذة عن الدار وإصداراتها *</label>
                <textarea id="pubBioInput" rows="3" placeholder="نبذة تعريفية عن الدار..."></textarea>
            </div>
            <div class="form-field">
                <label>شعار دار النشر (اختياري)</label>
                <input type="file" id="pubLogoInput" accept="image/*">
            </div>
            <div id="pubStatusMsg" class="status-feedback-text"></div>
            <button type="button" id="submitPubVerifyBtn" class="btn-primary-action w-100">
                <i class="ri-send-plane-fill"></i><span>إرسال طلب التوثيق للإدارة</span>
            </button>
        `;

        $("submitPubVerifyBtn").onclick = async () => {
            const name = $("pubNameInput").value.trim();
            const city = $("pubCityInput").value.trim();
            const proof = $("pubProofInput").value.trim();
            const bio = $("pubBioInput").value.trim();
            const file = $("pubLogoInput").files[0];
            const msg = $("pubStatusMsg");
            const btn = $("submitPubVerifyBtn");

            if (!name || !city || !proof || !bio) {
                msg.style.color = "var(--danger)";
                msg.textContent = "يرجى إكمال كافة الحقول المطلوبة.";
                return;
            }

            btn.disabled = true;
            msg.style.color = "var(--hujariya-gold)";
            msg.textContent = "جاري إرسال طلب التوثيق...";

            try {
                let logoUrl = "";
                if (file) logoUrl = await compressAndUploadImage(file, 400, 0.8);

                await addDoc(collection(db, "reviews"), {
                    recordType: "publisher",
                    name,
                    city,
                    proof,
                    bio,
                    logoUrl,
                    verified: isAdmin,
                    status: isAdmin ? "approved" : "pending",
                    userId: currentUser.uid,
                    userEmail: currentUser.email,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });

                await fetchAllEncyclopediaData();
                $("addEntityModal").style.display = "none";
                alert(isAdmin ? "تم اعتماد وتوثيق دار النشر فوراً!" : "تم استلام طلب توثيق الدار، وسيتم مراجعته من الإدارة.");
            } catch (e) {
                msg.style.color = "var(--danger)";
                msg.textContent = "تعذر الإرسال، حاول مرة أخرى.";
                btn.disabled = false;
            }
        };

        $("addEntityModal").style.display = "flex";
    });
}

// ============================================================================
// 9. رفع وتعديل الكتب + منع التكرار الذكي + ربط الكاتب
// ============================================================================
const addBookModal = $("addBookModal");

if ($("openAddModalBtn")) {
    $("openAddModalBtn").addEventListener("click", () => openBookFormModal(null));
}
if ($("closeAddModal")) {
    $("closeAddModal").addEventListener("click", () => addBookModal.style.display = "none");
}

if ($("toggleNewAuthorInlineBtn")) {
    $("toggleNewAuthorInlineBtn").addEventListener("click", () => {
        const box = $("inlineNewAuthorFields");
        box.style.display = box.style.display === "none" ? "block" : "none";
    });
}

if ($("bookCoverInput")) {
    $("bookCoverInput").addEventListener("change", () => {
        const f = $("bookCoverInput").files[0];
        if (f) $("selectedCoverName").textContent = `تم اختيار الغلاف: ${f.name}`;
    });
}

function openBookFormModal(bookToEdit = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول بحساب جوجل أولاً للمساهمة في الموسوعة.");
        navigateToPage("profileView");
        return;
    }

    $("editingBookId").value = bookToEdit ? bookToEdit.id : "";
    $("bookModalHeaderTitle").innerHTML = bookToEdit
        ? `<i class="ri-edit-box-line"></i> تعديل بيانات الكتاب (${escapeHtml(bookToEdit.title)})`
        : `<i class="ri-book-mark-line"></i> المساهمة بتوثيق كتاب في الموسوعة`;

    $("bookTitleInput").value = bookToEdit ? bookToEdit.title : "";
    $("bookAuthorInput").value = bookToEdit ? bookToEdit.author : "";
    $("bookCategoryInput").value = bookToEdit ? bookToEdit.category : "روايات وأدب";
    $("bookEraInput").value = bookToEdit?.era || "الألفية الحديثة";
    $("bookPublisherInput").value = bookToEdit?.publisher || "";
    $("bookCityYearInput").value = bookToEdit?.cityYear || "";
    $("bookDescInput").value = bookToEdit ? bookToEdit.description : "";
    $("bookDriveInput").value = bookToEdit?.downloadLink || "";
    $("bookAudioInput").value = bookToEdit?.audioUrl || "";
    $("bookCoverInput").value = "";
    $("selectedCoverName").textContent = bookToEdit
        ? "اتركه فارغاً للاحتفاظ بالغلاف الحالي، أو اختر غلافاً جديداً"
        : "اضغط لاختيار صورة غلاف الكتاب (سيتم ضغطها وتسريع رفعها تلقائياً)";
    $("submitBookBtnText").textContent = bookToEdit
        ? (isAdmin ? "حفظ التعديلات فوراً" : "حفظ التعديلات وإحالتها للمراجعة")
        : "فحص التكرار وإرسال للمراجعة";

    $("duplicateWarningBox").style.display = "none";
    $("uploadStatusMsg").textContent = "";
    addBookModal.style.display = "flex";
}

function checkDuplicateBookRealtime() {
    const editingId = $("editingBookId").value;
    const normT = normalizeArabic($("bookTitleInput").value);
    const normA = normalizeArabic($("bookAuthorInput").value);
    const warnBox = $("duplicateWarningBox");

    if (!normT || !normA) {
        warnBox.style.display = "none";
        return null;
    }

    const dup = allBooks.find(b =>
        b.id !== editingId &&
        normalizeArabic(b.title) === normT &&
        normalizeArabic(b.author) === normA
    );

    if (dup) {
        warnBox.style.display = "block";
        warnBox.innerHTML = `<i class="ri-error-warning-fill"></i> تنبيه منع التكرار: كتاب «${escapeHtml(dup.title)}» لنفس المؤلف «${escapeHtml(dup.author)}» مسجل مسبقاً في الموسوعة!`;
        return dup;
    }
    warnBox.style.display = "none";
    return null;
}

if ($("bookTitleInput")) $("bookTitleInput").addEventListener("input", checkDuplicateBookRealtime);
if ($("bookAuthorInput")) $("bookAuthorInput").addEventListener("input", checkDuplicateBookRealtime);

if ($("submitBookBtn")) {
    $("submitBookBtn").addEventListener("click", async () => {
        const editingId = $("editingBookId").value;
        const existingBook = editingId ? allBooks.find(b => b.id === editingId) : null;

        const title = $("bookTitleInput").value.trim();
        const author = $("bookAuthorInput").value.trim();
        const category = $("bookCategoryInput").value;
        const era = $("bookEraInput").value;
        const publisher = $("bookPublisherInput").value.trim();
        const cityYear = $("bookCityYearInput").value.trim();
        const description = $("bookDescInput").value.trim();
        const downloadLink = $("bookDriveInput").value.trim();
        const audioUrl = $("bookAudioInput").value.trim();
        const coverFile = $("bookCoverInput").files[0];

        const newAuthorBio = $("newAuthorBioInput").value.trim();
        const newAuthorPhotoFile = $("newAuthorPhotoInput").files[0];

        const msg = $("uploadStatusMsg");
        const btn = $("submitBookBtn");

        if (!title || !author || !description || (!coverFile && !existingBook)) {
            msg.style.color = "var(--danger)";
            msg.textContent = "يرجى تعبئة الحقول الأساسية (العنوان، المؤلف، الوصف، وصورة الغلاف).";
            return;
        }

        if (checkDuplicateBookRealtime()) {
            msg.style.color = "var(--danger)";
            msg.textContent = "لا يمكن الحفظ لأن الكتاب مسجل مسبقاً لنفس الكاتب.";
            return;
        }

        btn.disabled = true;
        msg.style.color = "var(--hujariya-gold)";
        msg.textContent = "جاري ضغط الغلاف ورفع البيانات بسرعة فائقة...";

        try {
            let coverUrl = existingBook ? existingBook.coverUrl : "";
            if (coverFile) {
                coverUrl = await compressAndUploadImage(coverFile, 800, 0.78);
            }

            // إذا أضاف المستخدم بيانات كاتب جديد من الصندوق المدمج
            const normAuth = normalizeArabic(author);
            const authorExists = allAuthors.some(a => !a.isImplicit && normalizeArabic(a.name) === normAuth);
            if (!authorExists && (newAuthorBio || newAuthorPhotoFile)) {
                let authorPhotoUrl = "";
                if (newAuthorPhotoFile) {
                    authorPhotoUrl = await compressAndUploadImage(newAuthorPhotoFile, 450, 0.8);
                }
                await addDoc(collection(db, "reviews"), {
                    recordType: "author",
                    name: author,
                    bio: newAuthorBio || `مؤلف كتاب ${title}`,
                    photoUrl: authorPhotoUrl,
                    userId: currentUser.uid,
                    userName: currentUser.displayName,
                    createdAt: Date.now()
                });
            }

            const newStatus = isAdmin
                ? (downloadLink ? "published_full" : "published_no_download")
                : "pending";

            const payload = {
                title,
                author,
                category,
                era,
                publisher,
                cityYear,
                description,
                downloadLink,
                audioUrl,
                coverUrl,
                status: newStatus,
                updatedAt: Date.now()
            };

            if (existingBook) {
                if (isAdmin) {
                    await updateDoc(doc(db, "books", existingBook.id), payload);
                    if (existingBook.overrideDocId) {
                        await deleteDoc(doc(db, "reviews", existingBook.overrideDocId));
                    }
                } else {
                    // حفظ تعديل المساهم أو دار النشر وإحالته للمراجعة فوراً
                    await addDoc(collection(db, "reviews"), {
                        recordType: "book_override",
                        bookId: existingBook.id,
                        userId: currentUser.uid,
                        userName: currentUser.displayName,
                        updatedFields: payload,
                        createdAt: Date.now()
                    });
                }
                await recordAuditLog("تعديل بيانات كتاب", `الكتاب: ${title} | الحالة: ${newStatus}`);
            } else {
                await addDoc(collection(db, "books"), {
                    ...payload,
                    addedByUid: currentUser.uid,
                    addedByName: currentUser.displayName,
                    addedByEmail: currentUser.email,
                    addedByPhoto: currentUser.photoURL || "",
                    ratingSum: 0,
                    ratingCount: 0,
                    createdAt: Date.now()
                });
                await recordAuditLog("إضافة كتاب جديد", `الكتاب: ${title} - المؤلف: ${author}`);
            }

            msg.style.color = "var(--success)";
            msg.textContent = isAdmin
                ? "تم النشر والاعتماد الفوري بنجاح!"
                : "تم الحفظ بنجاح! تحول الكتاب إلى «قيد المراجعة» ويمكنك متابعة حالته من قسم مكتبتي.";

            $("newAuthorBioInput").value = "";
            $("newAuthorPhotoInput").value = "";
            $("inlineNewAuthorFields").style.display = "none";

            await fetchAllEncyclopediaData();
            setTimeout(() => {
                addBookModal.style.display = "none";
                btn.disabled = false;
            }, 1300);
        } catch (err) {
            console.error(err);
            msg.style.color = "var(--danger)";
            msg.textContent = "حدث خطأ أثناء الرفع، يرجى التحقق من الاتصال والمحاولة مجدداً.";
            btn.disabled = false;
        }
    });
}

// ============================================================================
// 10. تفاصيل الكتاب الشاملة + القارئ الرقمي + الترابط الشبكي + الصلاحيات
// ============================================================================
function canUserEditBook(book) {
    if (!currentUser) return false;
    if (isAdmin) return true;
    if (book.addedByUid === currentUser.uid) return true;
    // التحقق مما إذا كان المستخدم يملك دار النشر الموثقة لهذا الكتاب
    if (book.publisher) {
        const normP = normalizeArabic(book.publisher);
        return allPublishers.some(p =>
            p.verified &&
            p.userId === currentUser.uid &&
            normalizeArabic(p.name) === normP
        );
    }
    return false;
}

function openBookDetails(book) {
    saveAiInteraction("categories", book.category, 2);
    saveAiInteraction("authors", normalizeArabic(book.author), 3);
    if (book.era) saveAiInteraction("eras", book.era, 1);
    updateDynamicSeo(book);

    const isFav = userFavorites.includes(book.id);
    const avg = book.ratingCount > 0 ? (book.ratingSum / book.ratingCount).toFixed(1) : "جديد";
    const bookReviews = allReviews.filter(r => r.bookId === book.id).sort((a, b) => b.createdAt - a.createdAt);

    // حساب وسام المساهم الذي رفع الكتاب
    const contributorBooksCount = allBooks.filter(b =>
        b.addedByUid === book.addedByUid &&
        (b.status === "published_full" || b.status === "published_no_download")
    ).length;
    const contributorRank = getContributorRank(contributorBooksCount);
    const contributorAvatar = book.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(book.addedByName || "م")}&background=182e29&color=c28e48`;

    // الكتب المرتبطة لنفس المؤلف + كتب مشابهة
    const normAuth = normalizeArabic(book.author);
    const sameAuthorBooks = allBooks.filter(b =>
        b.id !== book.id &&
        (b.status === "published_full" || b.status === "published_no_download") &&
        normalizeArabic(b.author) === normAuth
    );

    const similarBooks = allBooks.filter(b =>
        b.id !== book.id &&
        (b.status === "published_full" || b.status === "published_no_download") &&
        normalizeArabic(b.author) !== normAuth &&
        b.category === book.category
    ).slice(0, 8);

    const hasDriveFile = book.status === "published_full" && Boolean(book.downloadLink);
    const userCanEdit = canUserEditBook(book);

    const body = $("bookDetailsBody");
    body.innerHTML = `
        <!-- رأس البطاقة التعريفية للكتاب -->
        <div style="display:flex; gap:18px; flex-wrap:wrap; margin-bottom:16px;">
            <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" style="width:125px; height:180px; object-fit:cover; border-radius:12px; box-shadow:var(--shadow-md); border:1.5px solid var(--hujariya-gold);">
            <div style="flex:1; min-width:210px;">
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
                    <span class="gold-pill-badge">${escapeHtml(book.category)}</span>
                    ${book.era ? `<span class="gold-pill-badge">${escapeHtml(book.era)}</span>` : ""}
                </div>
                <h2 style="font-family:'Amiri',serif; font-size:1.5rem; line-height:1.25; margin-bottom:6px;">${escapeHtml(book.title)}</h2>
                
                <div id="detailAuthorTrigger" style="display:inline-flex; align-items:center; gap:6px; color:var(--hujariya-gold); font-weight:800; cursor:pointer; margin-bottom:6px;">
                    <i class="ri-quill-pen-fill"></i>
                    <span>المؤلف: ${escapeHtml(book.author)} (اضغط لعرض صفحته ومؤلفاته)</span>
                </div>

                ${book.publisher || book.cityYear ? `
                    <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:4px;">
                        <i class="ri-building-2-line"></i> ${escapeHtml(book.publisher || "نشر خاص")} ${book.cityYear ? `• ${escapeHtml(book.cityYear)}` : ""}
                    </p>
                ` : ""}

                <p style="font-size:0.86rem; color:#e69900; font-weight:800;">
                    <i class="ri-star-fill"></i> التقييم: ${avg} (${book.ratingCount || 0} مراجعة)
                </p>

                <!-- بطاقة المساهم التحفيزية -->
                <div style="display:flex; align-items:center; gap:10px; margin-top:10px; padding:8px 12px; background:var(--bg-main); border-radius:10px; border:1px solid var(--border-color);">
                    <img src="${escapeHtml(contributorAvatar)}" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1.5px solid var(--hujariya-gold);">
                    <div>
                        <strong style="font-size:0.8rem; display:block;">وثّقه المساهم: ${escapeHtml(book.addedByName || "باحث وطني")}</strong>
                        <span style="font-size:0.72rem; color:var(--hujariya-gold); font-weight:700;"><i class="${contributorRank.icon}"></i> ${contributorRank.title}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- مشغل ركن صوت المؤلف إن وجد -->
        ${book.audioUrl ? `
            <div style="background:var(--gold-soft); border:1px solid var(--hujariya-gold); padding:12px; border-radius:12px; margin-bottom:14px;">
                <strong style="display:block; font-size:0.85rem; margin-bottom:6px; color:var(--hujariya-gold);"><i class="ri-mic-2-fill"></i> ركن صوت المؤلف / قراءة صوتية مرفقة:</strong>
                <audio controls src="${escapeHtml(book.audioUrl)}" style="width:100%; height:36px;"></audio>
            </div>
        ` : ""}

        <!-- نبذة الكتاب -->
        <div style="background:var(--bg-main); padding:14px; border-radius:12px; border:1px solid var(--border-color); font-size:0.92rem; line-height:1.8; margin-bottom:16px; white-space:pre-line;">${escapeHtml(book.description)}</div>

        <!-- أزرار القراءة المدمجة والتحميل والحفظ والاستشهاد والإبلاغ -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap:9px; margin-bottom:16px;">
            ${hasDriveFile ? `
                <button type="button" id="openEmbeddedReaderBtn" class="btn-primary-action">
                    <i class="ri-book-read-fill"></i><span>قراءة مباشرة (القارئ الرقمي)</span>
                </button>
                <button type="button" id="openConfirmDlBtn" class="btn-gold-action" style="justify-content:center;">
                    <i class="ri-download-cloud-2-line"></i><span>تحميل الكتاب (PDF)</span>
                </button>
            ` : `
                <div style="grid-column:1/-1; padding:10px; border-radius:10px; background:var(--bg-soft); text-align:center; font-size:0.82rem; font-weight:700; color:var(--text-muted);">
                    <i class="ri-shield-keyhole-line"></i> هذا المؤلف مدرج للتوثيق الوطني والمراجعة والنقاش فقط حفاظاً على حقوق الملكية الفكرية
                </div>
            `}

            <button type="button" id="detailFavBtn" class="btn-secondary-action">
                <i class="${isFav ? 'ri-bookmark-fill' : 'ri-bookmark-line'}"></i>
                <span>${isFav ? 'محفوظ في مكتبتي' : 'حفظ في مكتبتي'}</span>
            </button>

            <button type="button" id="detailCiteShareBtn" class="btn-secondary-action">
                <i class="ri-double-quotes-r"></i><span>استشهاد أكاديمي ومشاركة</span>
            </button>

            ${userCanEdit ? `
                <button type="button" id="detailUserEditBtn" class="btn-secondary-action">
                    <i class="ri-edit-2-line"></i><span>تعديل بيانات الكتاب</span>
                </button>
            ` : ""}

            <button type="button" id="detailReportBtn" class="btn-secondary-action" style="color:var(--danger); border-color:rgba(214,48,49,0.3);">
                <i class="ri-alarm-warning-line"></i><span>إبلاغ عن مشكلة / حقوق</span>
            </button>
        </div>

        <!-- لوحة تحكم الإدارة الفورية داخل الكتاب (التعليق والتقييد والاعتماد) -->
        ${isAdmin ? `
            <div style="margin-bottom:18px; padding:14px; border:1.5px dashed var(--hujariya-gold); border-radius:12px; background:var(--gold-soft);">
                <strong style="display:block; margin-bottom:8px; font-size:0.86rem;"><i class="ri-vip-crown-fill" style="color:var(--hujariya-gold);"></i> تحكم الإدارة العليا بحالة الكتاب:</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" id="adminToggleDlStatusBtn" class="btn-primary-action" style="padding:7px 12px; font-size:0.78rem;">
                        <i class="ri-refresh-line"></i><span>${book.status === 'published_full' ? 'تحويل لموسوعي فقط (إيقاف التحميل)' : 'تفعيل التحميل والقراءة'}</span>
                    </button>
                    <button type="button" id="adminSuspendBookBtn" class="btn-gold-action" style="background:var(--warning); padding:7px 12px; font-size:0.78rem;">
                        <i class="ri-pause-circle-line"></i><span>${book.status === 'suspended' ? 'إلغاء التعليق وإعادة النشر' : 'تعليق / تقييد مؤقتاً'}</span>
                    </button>
                    <button type="button" id="adminFinalDeleteBtn" class="btn-primary-action" style="background:var(--danger); padding:7px 12px; font-size:0.78rem;">
                        <i class="ri-delete-bin-line"></i><span>حذف نهائي (خيار أخير)</span>
                    </button>
                </div>
            </div>
        ` : ""}

        <!-- الترابط الشبكي الأفقي 1: مؤلفات أخرى لنفس الكاتب -->
        ${sameAuthorBooks.length > 0 ? `
            <div style="margin-bottom:18px;">
                <h4 style="font-size:0.95rem; margin-bottom:8px; color:var(--hujariya-gold);"><i class="ri-quill-pen-line"></i> مؤلفات أخرى للكاتب «${escapeHtml(book.author)}»:</h4>
                <div class="horizontal-scroll-shelf" id="sameAuthorHorizontalShelf"></div>
            </div>
        ` : ""}

        <!-- الترابط الشبكي الأفقي 2: كتب مشابهة قد تعجبك -->
        ${similarBooks.length > 0 ? `
            <div style="margin-bottom:18px;">
                <h4 style="font-size:0.95rem; margin-bottom:8px; color:var(--hujariya-gold);"><i class="ri-sparkling-line"></i> كتب مشابهة في قسم «${escapeHtml(book.category)}» قد تهمك:</h4>
                <div class="horizontal-scroll-shelf" id="similarBooksHorizontalShelf"></div>
            </div>
        ` : ""}

        <!-- قسم المراجعات والنقاشات الثقافية -->
        <div style="border-top:1px solid var(--border-color); padding-top:15px;">
            <h4 style="margin-bottom:10px;"><i class="ri-chat-quote-line"></i> المراجعات والنقاشات النقدية (${bookReviews.length})</h4>
            <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
                <select id="newReviewStars" style="padding:9px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-weight:700;">
                    <option value="5">★★★★★ (5)</option>
                    <option value="4">★★★★ (4)</option>
                    <option value="3">★★★ (3)</option>
                    <option value="2">★★ (2)</option>
                    <option value="1">★ (1)</option>
                </select>
                <input type="text" id="newReviewComment" placeholder="شارك قراءتك النقدية أو انطباعك حول الكتاب..." style="flex:1; min-width:180px; padding:9px 12px; border-radius:10px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main);">
                <button type="button" id="submitReviewBtn" class="btn-primary-action" style="padding:9px 16px;">
                    <i class="ri-send-plane-2-fill"></i><span>نشر</span>
                </button>
            </div>
            <div>
                ${bookReviews.length === 0
                    ? `<p style="font-size:0.84rem; color:var(--text-muted);">لا توجد مراجعات بعد، كن أول من يثري النقاش حول هذا الكتاب.</p>`
                    : bookReviews.map(r => `
                        <div style="background:var(--bg-main); padding:10px 13px; border-radius:10px; margin-bottom:8px; border:1px solid var(--border-color);">
                            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.84rem; margin-bottom:4px;">
                                <span><i class="ri-user-smile-line"></i> ${escapeHtml(r.userName)}</span>
                                <span style="color:#e69900;">${"★".repeat(r.stars || 5)}</span>
                            </div>
                            <p style="font-size:0.86rem;">${escapeHtml(r.comment)}</p>
                        </div>
                    `).join("")}
            </div>
        </div>
    `;

    // تعبئة الرفوف الأفقية المترابطة
    const renderMiniShelf = (list, containerId) => {
        const el = $(containerId);
        if (!el) return;
        list.forEach(item => {
            const m = document.createElement("div");
            m.className = "mini-book-card";
            m.innerHTML = `
                <img src="${escapeHtml(item.coverUrl)}" alt="${escapeHtml(item.title)}">
                <h5>${escapeHtml(item.title)}</h5>
            `;
            m.onclick = () => openBookDetails(item);
            el.appendChild(m);
        });
    };
    renderMiniShelf(sameAuthorBooks, "sameAuthorHorizontalShelf");
    renderMiniShelf(similarBooks, "similarBooksHorizontalShelf");

    // الأحداث التفاعلية داخل نافذة الكتاب
    $("detailAuthorTrigger").onclick = () => {
        $("bookDetailsModal").style.display = "none";
        openAuthorProfileModal(book.author);
    };

    if ($("openEmbeddedReaderBtn")) {
        $("openEmbeddedReaderBtn").onclick = () => {
            $("pdfReaderTitle").innerHTML = `<i class="ri-book-read-line"></i> قراءة: ${escapeHtml(book.title)}`;
            $("pdfViewerFrame").src = toEmbedDrivePreview(book.downloadLink);
            $("pdfReaderModal").style.display = "flex";
        };
    }

    if ($("openConfirmDlBtn")) {
        $("openConfirmDlBtn").onclick = () => {
            $("confirmDownloadBookTitle").textContent = `كتاب «${book.title}» - ${book.author}`;
            $("confirmDirectDownloadLink").href = toDirectDriveDownload(book.downloadLink);
            $("confirmDownloadModal").style.display = "flex";
        };
    }

    $("detailFavBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول أولاً لحفظ الكتب في مكتبتك.");
        if (isFav) userFavorites = userFavorites.filter(id => id !== book.id);
        else userFavorites.push(book.id);
        await updateDoc(doc(db, "users", currentUser.uid), { favorites: userFavorites });
        openBookDetails(book);
        renderAllViews();
    };

    $("detailCiteShareBtn").onclick = () => openCitationAndShareModal(book);
    $("detailReportBtn").onclick = () => openReportTicketModal(book);

    if ($("detailUserEditBtn")) {
        $("detailUserEditBtn").onclick = () => {
            $("bookDetailsModal").style.display = "none";
            openBookFormModal(book);
        };
    }

    $("submitReviewBtn").onclick = async () => {
        if (!currentUser) return alert("يرجى تسجيل الدخول لإضافة مراجعة.");
        const stars = parseInt($("newReviewStars").value, 10);
        const comment = $("newReviewComment").value.trim();
        if (!comment) return;

        await addDoc(collection(db, "reviews"), {
            recordType: "review",
            bookId: book.id,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            stars,
            comment,
            createdAt: Date.now()
        });

        const newSum = (book.ratingSum || 0) + stars;
        const newCount = (book.ratingCount || 0) + 1;
        await updateDoc(doc(db, "books", book.id), { ratingSum: newSum, ratingCount: newCount });
        await fetchAllEncyclopediaData();
        const updated = allBooks.find(b => b.id === book.id);
        if (updated) openBookDetails(updated);
    };

    if (isAdmin) {
        $("adminToggleDlStatusBtn").onclick = async () => {
            if (book.status === "published_full") {
                await updateDoc(doc(db, "books", book.id), { status: "published_no_download" });
            } else {
                const link = book.downloadLink || prompt("أدخل رابط جوجل درايف لتفعيل القراءة والتحميل:");
                if (!link) return;
                await updateDoc(doc(db, "books", book.id), { status: "published_full", downloadLink: link.trim() });
            }
            await recordAuditLog("تغيير صلاحية تحميل كتاب", `الكتاب: ${book.title}`);
            await fetchAllEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetails(updated);
        };

        $("adminSuspendBookBtn").onclick = async () => {
            const nextStatus = book.status === "suspended"
                ? (book.downloadLink ? "published_full" : "published_no_download")
                : "suspended";
            await updateDoc(doc(db, "books", book.id), { status: nextStatus });
            await recordAuditLog(nextStatus === "suspended" ? "تعليق وتقييد كتاب" : "فك تقييد كتاب", `الكتاب: ${book.title}`);
            await fetchAllEncyclopediaData();
            const updated = allBooks.find(b => b.id === book.id);
            if (updated) openBookDetails(updated);
        };

        $("adminFinalDeleteBtn").onclick = async () => {
            if (confirm(`تنبيه: الحذف خيار أخير! هل تفضل حذف كتاب «${book.title}» نهائياً بدلاً من تعليقه؟`)) {
                await deleteDoc(doc(db, "books", book.id));
                await recordAuditLog("حذف نهائي لكتاب", `الكتاب: ${book.title}`);
                $("bookDetailsModal").style.display = "none";
                await fetchAllEncyclopediaData();
            }
        };
    }

    $("bookDetailsModal").style.display = "flex";
}

if ($("closeDetailsModal")) $("closeDetailsModal").onclick = () => $("bookDetailsModal").style.display = "none";
if ($("closePdfReaderModal")) {
    $("closePdfReaderModal").onclick = () => {
        $("pdfReaderModal").style.display = "none";
        $("pdfViewerFrame").src = "";
    };
}
if ($("closeConfirmDownload")) $("closeConfirmDownload").onclick = () => $("confirmDownloadModal").style.display = "none";
if ($("cancelDownloadBtn")) $("cancelDownloadBtn").onclick = () => $("confirmDownloadModal").style.display = "none";
if ($("confirmDirectDownloadLink")) {
    $("confirmDirectDownloadLink").onclick = () => setTimeout(() => $("confirmDownloadModal").style.display = "none", 400);
}

// ============================================================================
// 11. أداة الاستشهاد المرجعي للباحثين (APA / MLA) والمشاركة الاجتماعية
// ============================================================================
function openCitationAndShareModal(book) {
    const year = (book.cityYear && book.cityYear.match(/\d{4}/)?.[0]) || new Date(book.createdAt || Date.now()).getFullYear();
    const pub = book.publisher || "موسوعة الحجرية الوطنية";
    const pageUrl = window.location.href.split("#")[0];

    const apaCitation = `${book.author}. (${year}). ${book.title}. ${pub}. مسترجع من موسوعة الحجرية الوطنية: ${pageUrl}`;
    const mlaCitation = `${book.author}. "${book.title}." ${pub}، ${year}. موسوعة الحجرية الرقمية، ${pageUrl}.`;
    const shareText = `📚 كتاب «${book.title}» للمؤلف اليمني «${book.author}»\nموثق في موسوعة الحجرية الوطنية:\n${pageUrl}`;

    $("citationModalBody").innerHTML = `
        <p style="font-size:0.86rem; color:var(--text-muted); margin-bottom:12px;">
            انسخ التوثيق المرجعي الأكاديمي لاستخدامه في الأبحاث والدراسات العلمية:
        </p>

        <div class="citation-box">
            <strong style="display:block; color:var(--hujariya-gold); margin-bottom:4px;">صيغة (APA) القياسية:</strong>
            <p id="apaText">${escapeHtml(apaCitation)}</p>
            <button type="button" class="btn-secondary-action" style="margin-top:8px; padding:5px 12px; font-size:0.78rem;" id="copyApaBtn">
                <i class="ri-file-copy-line"></i> نسخ توثيق APA
            </button>
        </div>

        <div class="citation-box">
            <strong style="display:block; color:var(--hujariya-gold); margin-bottom:4px;">صيغة (MLA) الأدبية:</strong>
            <p id="mlaText">${escapeHtml(mlaCitation)}</p>
            <button type="button" class="btn-secondary-action" style="margin-top:8px; padding:5px 12px; font-size:0.78rem;" id="copyMlaBtn">
                <i class="ri-file-copy-line"></i> نسخ توثيق MLA
            </button>
        </div>

        <h4 style="font-size:0.92rem; margin:16px 0 8px;"><i class="ri-share-forward-line"></i> مشاركة البطاقة عبر منصات التواصل:</h4>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <a href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener" class="btn-primary-action" style="flex:1; background:#25D366; text-decoration:none;">
                <i class="ri-whatsapp-line"></i> واتساب
            </a>
            <a href="https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener" class="btn-primary-action" style="flex:1; background:#0088cc; text-decoration:none;">
                <i class="ri-telegram-line"></i> تيليجرام
            </a>
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener" class="btn-primary-action" style="flex:1; background:#111; text-decoration:none;">
                <i class="ri-twitter-x-line"></i> منصة إكس
            </a>
        </div>
    `;

    $("copyApaBtn").onclick = () => {
        navigator.clipboard.writeText(apaCitation);
        $("copyApaBtn").innerHTML = `<i class="ri-check-line"></i> تم النسخ!`;
    };
    $("copyMlaBtn").onclick = () => {
        navigator.clipboard.writeText(mlaCitation);
        $("copyMlaBtn").innerHTML = `<i class="ri-check-line"></i> تم النسخ!`;
    };

    $("citationModal").style.display = "flex";
}

if ($("closeCitationModal")) $("closeCitationModal").onclick = () => $("citationModal").style.display = "none";

// ============================================================================
// 12. نظام الإبلاغ والمحادثة المباشرة مع الإدارة (مع إرفاق حتى 3 صور)
// ============================================================================
function openReportTicketModal(book = null, existingTicket = null) {
    if (!currentUser) {
        alert("يرجى تسجيل الدخول أولاً لفتح بلاغ ومتابعة المحادثة مع الإدارة.");
        navigateToPage("profileView");
        return;
    }

    const body = $("reportModalBody");

    // إذا كان هناك بلاغ مفتوح، نعرض شات المحادثة المباشر بين المبلّغ والإدارة
    if (existingTicket) {
        const messages = existingTicket.messages || [];
        const relatedBook = allBooks.find(b => b.id === existingTicket.bookId);

        body.innerHTML = `
            <div style="background:var(--bg-main); padding:12px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>بلاغ بخصوص: ${escapeHtml(existingTicket.bookTitle)}</strong>
                    <span class="gold-pill-badge">${existingTicket.status === "resolved" ? "مغلق / تمت المعالجة" : "مفتوح للمتابعة"}</span>
                </div>
                <small style="color:var(--text-muted);">مقدم البلاغ: ${escapeHtml(existingTicket.userName)} | السبب: ${escapeHtml(existingTicket.reason)}</small>
            </div>

            ${isAdmin && relatedBook ? `
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                    <button type="button" id="reportAdminSuspendBtn" class="btn-gold-action" style="background:var(--warning); font-size:0.78rem; padding:6px 10px;">
                        <i class="ri-pause-circle-line"></i> تعليق الكتاب مؤقتاً
                    </button>
                    <button type="button" id="reportAdminNoDlBtn" class="btn-secondary-action" style="font-size:0.78rem; padding:6px 10px;">
                        <i class="ri-lock-line"></i> إلغاء التحميل (موسوعي فقط)
                    </button>
                    <button type="button" id="reportAdminResolveBtn" class="btn-primary-action" style="background:var(--success); font-size:0.78rem; padding:6px 10px;">
                        <i class="ri-check-double-line"></i> إغلاق البلاغ كمحلول
                    </button>
                </div>
            ` : ""}

            <div class="chat-messages-box" id="reportChatScrollBox">
                ${messages.map(m => `
                    <div class="chat-bubble ${m.isAdminReply ? 'admin' : 'user'}">
                        <strong style="display:block; font-size:0.75rem; margin-bottom:3px;">
                            ${m.isAdminReply ? '🛡️ إدارة موسوعة الحجرية' : escapeHtml(m.senderName)}
                        </strong>
                        <p>${escapeHtml(m.text)}</p>${m.images && m.images.length > 0 ? `
                            <div class="chat-images-grid">
                                ${m.images.map(url => `<a href="${escapeHtml(url)}" target="_blank"><img src="${escapeHtml(url)}" alt="مرفق"></a>`).join("")}
                            </div>
                        ` : ""}
                    </div>
                `).join("")}
            </div>

            <div class="form-field">
                <label>إضافة رد أو توضيح في المحادثة</label>
                <textarea id="chatReplyInput" rows="2" placeholder="اكتب رسالتك هنا..."></textarea>
            </div>
            <div class="form-field">
                <label><i class="ri-image-add-line"></i> إرفاق صور توضيحية (بحد أقصى 3 صور - اختياري)</label>
                <input type="file" id="chatReplyImages" accept="image/*" multiple>
            </div>
            <div id="chatSendStatus" class="status-feedback-text"></div>
            <button type="button" id="sendChatReplyBtn" class="btn-primary-action w-100">
                <i class="ri-send-plane-fill"></i><span>إرسال الرد</span>
            </button>
        `;

        const scrollBox = $("reportChatScrollBox");
        if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;

        $("sendChatReplyBtn").onclick = async () => {
            const text = $("chatReplyInput").value.trim();
            const files = Array.from($("chatReplyImages").files).slice(0, 3);
            const statusEl = $("chatSendStatus");
            const btn = $("sendChatReplyBtn");

            if (!text && files.length === 0) return;
            btn.disabled = true;
            statusEl.textContent = "جاري إرسال الرسالة والمرفقات...";

            try {
                const uploadedUrls = [];
                for (const f of files) {
                    const url = await compressAndUploadImage(f, 800, 0.75);
                    uploadedUrls.push(url);
                }

                const updatedMessages = [
                    ...(existingTicket.messages || []),
                    {
                        senderUid: currentUser.uid,
                        senderName: currentUser.displayName,
                        isAdminReply: isAdmin,
                        text: text || "مرفق صور توضيحية",
                        images: uploadedUrls,
                        time: Date.now()
                    }
                ];

                await updateDoc(doc(db, "reviews", existingTicket.id), {
                    messages: updatedMessages,
                    updatedAt: Date.now()
                });

                await fetchAllEncyclopediaData();
                const refreshed = allReports.find(r => r.id === existingTicket.id);
                if (refreshed) openReportTicketModal(null, refreshed);
            } catch (e) {
                statusEl.textContent = "تعذر الإرسال، حاول مجدداً.";
                btn.disabled = false;
            }
        };

        if (isAdmin && relatedBook) {
            $("reportAdminSuspendBtn").onclick = async () => {
                await updateDoc(doc(db, "books", relatedBook.id), { status: "suspended" });
                await recordAuditLog("تعليق كتاب بسبب بلاغ", `الكتاب: ${relatedBook.title}`);
                alert("تم تعليق الكتاب وتقييده فوراً.");
                fetchAllEncyclopediaData();
            };
            $("reportAdminNoDlBtn").onclick = async () => {
                await updateDoc(doc(db, "books", relatedBook.id), { status: "published_no_download", downloadLink: "" });
                await recordAuditLog("إلغاء تحميل كتاب بناءً على بلاغ حقوق", `الكتاب: ${relatedBook.title}`);
                alert("تم إلغاء التحميل وتحويل الكتاب لنسخة موسوعية فقط.");
                fetchAllEncyclopediaData();
            };
            $("reportAdminResolveBtn").onclick = async () => {
                await updateDoc(doc(db, "reviews", existingTicket.id), { status: "resolved", updatedAt: Date.now() });
                await fetchAllEncyclopediaData();
                $("reportModal").style.display = "none";
            };
        }

        $("reportModal").style.display = "flex";
        return;
    }

    // إنشاء بلاغ جديد حول كتاب
    body.innerHTML = `
        <div class="guide-alert-box">
            <i class="ri-shield-check-line"></i>
            <span>يفتح هذا البلاغ محادثة خاصة ومباشرة مع إدارة الموسوعة، ويمكنك إرفاق حتى 3 صور لإثبات حقوق الملكية أو توضيح المشكلة.</span>
        </div>

        <div class="form-field">
            <label>الكتاب المُبلّغ عنه</label>
            <input type="text" value="${escapeHtml(book?.title || "")}" readonly>
        </div>

        <div class="form-field">
            <label>سبب البلاغ *</label>
            <select id="reportReasonSelect">
                <option value="حقوق ملكية فكرية / طلب إيقاف التحميل">حقوق ملكية فكرية / طلب إيقاف التحميل المباشر</option>
                <option value="خطأ في بيانات الكتاب أو المؤلف">خطأ في بيانات الكتاب أو نسبته للمؤلف</option>
                <option value="رابط جوجل درايف لا يعمل أو مغلق">رابط جوجل درايف لا يعمل أو مغلق الصلاحية</option>
                <option value="محتوى مخالف لمعايير الموسوعة">محتوى مخالف لمعايير الموسوعة الوطنية</option>
            </select>
        </div>

        <div class="form-field">
            <label>تفاصيل البلاغ والرسالة للإدارة *</label>
            <textarea id="reportDetailsInput" rows="3" placeholder="اشرح المشكلة بالتفصيل ليتم معالجتها فوراً..."></textarea>
        </div>

        <div class="form-field">
            <label><i class="ri-camera-line"></i> إرفاق صور توضيحية أو إثباتات (حتى 3 صور - اختياري)</label>
            <input type="file" id="reportImagesInput" accept="image/*" multiple>
        </div>

        <div id="reportSubmitStatus" class="status-feedback-text"></div>

        <button type="button" id="createReportTicketBtn" class="btn-primary-action w-100" style="background:var(--danger);">
            <i class="ri-alarm-warning-fill"></i><span>إرسال البلاغ وفتح محادثة مع الإدارة</span>
        </button>
    `;

    $("createReportTicketBtn").onclick = async () => {
        const reason = $("reportReasonSelect").value;
        const details = $("reportDetailsInput").value.trim();
        const files = Array.from($("reportImagesInput").files).slice(0, 3);
        const statusEl = $("reportSubmitStatus");
        const btn = $("createReportTicketBtn");

        if (!details) {
            statusEl.style.color = "var(--danger)";
            statusEl.textContent = "يرجى كتابة تفاصيل البلاغ.";
            return;
        }

        btn.disabled = true;
        statusEl.style.color = "var(--hujariya-gold)";
        statusEl.textContent = "جاري ضغط المرفقات وفتح محادثة البلاغ...";

        try {
            const uploadedUrls = [];
            for (const f of files) {
                const url = await compressAndUploadImage(f, 800, 0.75);
                uploadedUrls.push(url);
            }

            const docRef = await addDoc(collection(db, "reviews"), {
                recordType: "report",
                bookId: book.id,
                bookTitle: book.title,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                userEmail: currentUser.email,
                reason,
                status: "open",
                messages: [
                    {
                        senderUid: currentUser.uid,
                        senderName: currentUser.displayName,
                        isAdminReply: false,
                        text: details,
                        images: uploadedUrls,
                        time: Date.now()
                    }
                ],
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            await fetchAllEncyclopediaData();
            const createdTicket = allReports.find(r => r.id === docRef.id);
            if (createdTicket) openReportTicketModal(null, createdTicket);
        } catch (e) {
            statusEl.style.color = "var(--danger)";
            statusEl.textContent = "تعذر إرسال البلاغ، حاول مجدداً.";
            btn.disabled = false;
        }
    };

    $("reportModal").style.display = "flex";
}

if ($("closeReportModal")) $("closeReportModal").onclick = () => $("reportModal").style.display = "none";

// ============================================================================
// 13. مكتبتي (المفضلة + حالة مساهماتي + محادثات بلاغاتي)
// ============================================================================
document.querySelectorAll("#myUploadsStatusFilter .era-pill").forEach(pill => {
    pill.addEventListener("click", () => {
        document.querySelectorAll("#myUploadsStatusFilter .era-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        activeMyUploadsFilter = pill.getAttribute("data-st");
        renderMyLibraryView();
    });
});

function renderMyLibraryView() {
    const savedShelf = $("savedBooksShelf");
    const uploadsShelf = $("myUploadedBooksShelf");
    const reportsList = $("myReportsTicketsList");
    if (!savedShelf || !uploadsShelf || !reportsList) return;

    savedShelf.innerHTML = "";
    uploadsShelf.innerHTML = "";
    reportsList.innerHTML = "";

    const favs = allBooks.filter(b => userFavorites.includes(b.id));
    if (favs.length === 0) {
        savedShelf.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">لم تقم بحفظ أي كتاب في مفضلتك بعد.</p>`;
    } else {
        favs.forEach(b => savedShelf.appendChild(createBookCard(b)));
    }

    const myBooks = allBooks.filter(b => b.addedByUid === currentUser?.uid);
    const filteredUploads = myBooks.filter(b => {
        if (activeMyUploadsFilter === "all") return true;
        if (activeMyUploadsFilter === "published") {
            return b.status === "published_full" || b.status === "published_no_download";
        }
        return b.status === activeMyUploadsFilter;
    });

    if (filteredUploads.length === 0) {
        uploadsShelf.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">لا توجد كتب في هذه الحالة حالياً.</p>`;
    } else {
        filteredUploads.forEach(b => uploadsShelf.appendChild(createBookCard(b, true)));
    }

    const myReports = allReports.filter(r => r.userId === currentUser?.uid);
    if (myReports.length === 0) {
        reportsList.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">لا توجد لديك أي بلاغات أو محادثات مفتوحة مع الإدارة.</p>`;
    } else {
        myReports.forEach(ticket => {
            const div = document.createElement("div");
            div.className = "ticket-card-item";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <h4><i class="ri-discuss-line" style="color:var(--hujariya-gold);"></i> بلاغ حول: ${escapeHtml(ticket.bookTitle)}</h4>
                        <p style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(ticket.reason)} • (${(ticket.messages || []).length} رسائل)</p>
                    </div>
                    <button type="button" class="btn-primary-action" style="padding:7px 14px; font-size:0.8rem;">
                        <i class="ri-chat-3-line"></i> فتح المحادثة
                    </button>
                </div>
            `;
            div.querySelector("button").onclick = () => openReportTicketModal(null, ticket);
            reportsList.appendChild(div);
        });
    }
}

// ============================================================================
// 14. غرفة القيادة والإدارة المطلقة (مراجعة، تعليق، بلاغات، توثيق دور النشر)
// ============================================================================
function renderAdminDashboard() {
    const pendingBooks = allBooks.filter(b => b.status === "pending" || b.status === "suspended");
    const openReports = allReports.filter(r => r.status !== "resolved");
    const pendingPubs = allPublishers.filter(p => !p.isImplicit && p.status === "pending");

    const totalTasks = pendingBooks.length + openReports.length + pendingPubs.length;
    if ($("pendingBadge")) $("pendingBadge").textContent = totalTasks;
    if ($("adminPendingCount")) $("adminPendingCount").textContent = pendingBooks.length;
    if ($("adminReportsCount")) $("adminReportsCount").textContent = openReports.length;
    if ($("adminPubsCount")) $("adminPubsCount").textContent = pendingPubs.length;

    // 1. طابور الكتب المعلقة والمقيدة
    const pendingContainer = $("pendingBooksList");
    if (pendingContainer) {
        pendingContainer.innerHTML = "";
        if (pendingBooks.length === 0) {
            pendingContainer.innerHTML = `<div class="admin-card-item" style="text-align:center;">لا توجد كتب معلقة أو مقيدة حالياً.</div>`;
        } else {
            pendingBooks.forEach(book => {
                const item = document.createElement("div");
                item.className = "admin-card-item";
                item.innerHTML = `
                    <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
                        <img src="${escapeHtml(book.coverUrl)}" style="width:76px; height:112px; object-fit:cover; border-radius:8px;">
                        <div style="flex:1; min-width:210px;">
                            <span class="gold-pill-badge">${book.status === "suspended" ? "⚠️ معلق / مقيد" : "⏳ قيد المراجعة"}</span>
                            <h4 style="margin:5px 0;">${escapeHtml(book.title)}</h4>
                            <p style="font-size:0.82rem; color:var(--text-muted);">المؤلف: ${escapeHtml(book.author)} | المساهم: ${escapeHtml(book.addedByName || "مستخدم")}</p>
                            <p style="font-size:0.82rem; margin:6px 0;">${escapeHtml(book.description)}</p>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                                <button type="button" class="btn-primary-action adm-approve-full" style="background:var(--success); padding:7px 12px; font-size:0.78rem;">
                                    <i class="ri-check-double-line"></i> اعتماد مع القراءة والتحميل
                                </button>
                                <button type="button" class="btn-gold-action adm-approve-nodl" style="padding:7px 12px; font-size:0.78rem;">
                                    <i class="ri-book-open-line"></i> اعتماد موسوعي فقط (بدون تحميل)
                                </button>
                                <button type="button" class="btn-secondary-action adm-suspend" style="padding:7px 12px; font-size:0.78rem;">
                                    <i class="ri-pause-circle-line"></i> تعليق / تقييد
                                </button>
                                <button type="button" class="btn-primary-action adm-reject" style="background:var(--danger); padding:7px 12px; font-size:0.78rem;">
                                    <i class="ri-close-circle-line"></i> رفض المساهمة
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                const applyStatus = async (st, clearDl = false) => {
                    const updateData = { status: st };
                    if (clearDl) updateData.downloadLink = "";
                    if (book.overrideDocId) {
                        Object.assign(updateData, bookOverrides[book.id].updatedFields, { status: st });
                        await deleteDoc(doc(db, "reviews", book.overrideDocId));
                    }
                    await updateDoc(doc(db, "books", book.id), updateData);
                    await recordAuditLog(`قرار إدارة: ${st}`, `الكتاب: ${book.title}`);
                    fetchAllEncyclopediaData();
                };

                item.querySelector(".adm-approve-full").onclick = () => applyStatus("published_full");
                item.querySelector(".adm-approve-nodl").onclick = () => applyStatus("published_no_download", true);
                item.querySelector(".adm-suspend").onclick = () => applyStatus("suspended");
                item.querySelector(".adm-reject").onclick = () => applyStatus("rejected");
                pendingContainer.appendChild(item);
            });
        }
    }

    // 2. قائمة البلاغات والمحادثات المصورة
    const reportsContainer = $("adminReportsList");
    if (reportsContainer) {
        reportsContainer.innerHTML = "";
        if (allReports.length === 0) {
            reportsContainer.innerHTML = `<div class="admin-card-item" style="text-align:center;">لا توجد بلاغات مسجلة.</div>`;
        } else {
            allReports.forEach(rep => {
                const div = document.createElement("div");
                div.className = "admin-card-item";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <span class="gold-pill-badge">${rep.status === "resolved" ? "✅ محلول" : "🚨 بلاغ نشط"}</span>
                            <h4 style="margin:5px 0;">بلاغ على كتاب: ${escapeHtml(rep.bookTitle)}</h4>
                            <p style="font-size:0.82rem; color:var(--text-muted);">المبلّغ: ${escapeHtml(rep.userName)} | السبب: ${escapeHtml(rep.reason)}</p>
                        </div>
                        <button type="button" class="btn-primary-action" style="padding:8px 14px; font-size:0.8rem;">
                            <i class="ri-chat-check-line"></i> فتح المحادثة والصور (${(rep.messages || []).length})
                        </button>
                    </div>
                `;
                div.querySelector("button").onclick = () => openReportTicketModal(null, rep);
                reportsContainer.appendChild(div);
            });
        }
    }

    // 3. توثيق دور النشر اليمنية
    const pubsContainer = $("adminPublishersList");
    if (pubsContainer) {
        pubsContainer.innerHTML = "";
        const realPubs = allPublishers.filter(p => !p.isImplicit);
        if (realPubs.length === 0) {
            pubsContainer.innerHTML = `<div class="admin-card-item" style="text-align:center;">لا توجد طلبات توثيق لدور النشر حالياً.</div>`;
        } else {
            realPubs.forEach(pub => {
                const div = document.createElement("div");
                div.className = "admin-card-item";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <span class="gold-pill-badge">${pub.verified ? "موثقة بالشارة الذهبية" : "بانتظار التوثيق"}</span>
                            <h4 style="margin:5px 0;">${escapeHtml(pub.name)} (${escapeHtml(pub.city)})</h4>
                            <p style="font-size:0.82rem; color:var(--text-muted);">إثبات الهوية: ${escapeHtml(pub.proof)} | مقدم الطلب: ${escapeHtml(pub.userEmail)}</p>
                            <p style="font-size:0.82rem; margin-top:4px;">${escapeHtml(pub.bio)}</p>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn-primary-action pub-verify-btn" style="background:var(--success); padding:7px 12px; font-size:0.78rem;">
                                <i class="ri-verified-badge-fill"></i> ${pub.verified ? "إلغاء التوثيق" : "توثيق واعتماد الدار"}
                            </button>
                        </div>
                    </div>
                `;
                div.querySelector(".pub-verify-btn").onclick = async () => {
                    await updateDoc(doc(db, "reviews", pub.id), {
                        verified: !pub.verified,
                        status: !pub.verified ? "approved" : "pending"
                    });
                    await recordAuditLog("تحديث توثيق دار نشر", `الدار: ${pub.name}`);
                    fetchAllEncyclopediaData();
                };
                pubsContainer.appendChild(div);
            });
        }
    }

    // 4. سجل الشفافية والتعديلات (Audit Trail)
    const auditContainer = $("adminAuditLogsList");
    if (auditContainer) {
        auditContainer.innerHTML = "";
        if (allAuditLogs.length === 0) {
            auditContainer.innerHTML = `<div class="admin-card-item" style="text-align:center;">لا توجد سجلات بعد.</div>`;
        } else {
            allAuditLogs.slice(0, 35).forEach(log => {
                const d = new Date(log.createdAt || Date.now()).toLocaleString("ar-YE");
                const div = document.createElement("div");
                div.className = "admin-card-item";
                div.style.padding = "10px 14px";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:0.84rem;">
                        <strong><i class="ri-shield-check-line" style="color:var(--hujariya-gold);"></i> ${escapeHtml(log.actionTitle)}</strong>
                        <span style="color:var(--text-muted); font-size:0.75rem;">${d}</span>
                    </div>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:3px;">${escapeHtml(log.detailsText)} — بواسطة: ${escapeHtml(log.userName)}</p>
                `;
                auditContainer.appendChild(div);
            });
        }
    }
}

// ============================================================================
// 15. لوحة الشرف للمساهمين + دليل الاستخدام + الشروط والخصوصية + PWA
// ============================================================================
if ($("openHonorBoardBtn")) {
    $("openHonorBoardBtn").addEventListener("click", () => {
        const countsMap = {};
        allBooks.filter(b => b.status === "published_full" || b.status === "published_no_download").forEach(b => {
            const key = b.addedByUid || b.addedByName || "anon";
            if (!countsMap[key]) {
                countsMap[key] = {
                    name: b.addedByName || "باحث وطني",
                    photo: b.addedByPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(b.addedByName || "م")}&background=182e29&color=c28e48`,
                    count: 0
                };
            }
            countsMap[key].count++;
        });

        const leaders = Object.values(countsMap).sort((a, b) => b.count - a.count).slice(0, 15);

        $("infoModalTitle").innerHTML = `<i class="ri-medal-fill"></i> لوحة الشرف الوطنية للمساهمين`;
        $("infoModalBody").innerHTML = `
            <div class="guide-alert-box">
                <i class="ri-award-fill"></i>
                <span>تُخلّد موسوعة الحجرية أسماء الباحثين والقراء المساهمين في توثيق وحفظ المؤلفات اليمنية.</span>
            </div>
            ${leaders.length === 0 ? `<p style="color:var(--text-muted);">كن أول المساهمين لتتصدر لوحة الشرف الوطنية!</p>` :
            leaders.map((u, idx) => {
                const rank = getContributorRank(u.count);
                return `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--bg-main); border-radius:12px; margin-bottom:10px; border:1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <strong style="font-size:1.1rem; color:var(--hujariya-gold); width:24px;">#${idx + 1}</strong>
                            <img src="${escapeHtml(u.photo)}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--hujariya-gold);">
                            <div>
                                <h4 style="font-size:0.95rem;">${escapeHtml(u.name)}</h4>
                                <span style="font-size:0.76rem; color:var(--hujariya-gold); font-weight:700;"><i class="${rank.icon}"></i> ${rank.title}</span>
                            </div>
                        </div>
                        <span class="gold-pill-badge">${u.count} كتاب موثق</span>
                    </div>
                `;
            }).join("")}
        `;
        $("infoModal").style.display = "flex";
    });
}

if ($("openFaqModalBtn")) {
    $("openFaqModalBtn").addEventListener("click", () => {
        $("infoModalTitle").innerHTML = `<i class="ri-question-line"></i> دليل الاستخدام والأسئلة الشائعة`;
        $("infoModalBody").innerHTML = `
            <div class="citation-box">
                <strong style="color:var(--hujariya-gold);">1. ما هي موسوعة ومكتبة الحجرية الوطنية؟</strong>
                <p>مؤسسة ثقافية وطنية غير ربحية تهدف إلى بناء أرشيف مرجعي شامل للمؤلفات والكتّاب ودور النشر اليمنية.</p>
            </div>
            <div class="citation-box">
                <strong style="color:var(--hujariya-gold);">2. لماذا بعض الكتب متاحة للقراءة والتحميل وبعضها «موسوعي فقط»؟</strong>
                <p>الكتب المجانية أو المأذون بنشرها يُتاح قراءتها عبر القارئ الرقمي المدمج وتحميلها من جوجل درايف، أما الكتب المحمية بحقوق النشر فتُدرج للتوثيق التاريخي والمراجعة النقدية والاستشهاد الأكاديمي فقط.</p>
            </div>
            <div class="citation-box">
                <strong style="color:var(--hujariya-gold);">3. كيف أربط الكتاب بالمؤلف أو أفتح صلاحية جوجل درايف؟</strong>
                <p>عند الضغط على «نشر كتاب» يمكنك اختيار المؤلف من القائمة أو إضافة بطاقة كاتب جديد، وعند وضع رابط جوجل درايف يرجى جعله «متاحاً لأي شخص لديه الرابط» كما هو موضح في بطاقة التنبيه.</p>
            </div>
        `;
        $("infoModal").style.display = "flex";
    });
}

if ($("openLegalModalBtn")) {
    $("openLegalModalBtn").addEventListener("click", () => {
        $("infoModalTitle").innerHTML = `<i class="ri-scales-3-line"></i> شروط الاستخدام وسياسة الخصوصية وحقوق الملكية`;
        $("infoModalBody").innerHTML = `
            <div class="citation-box">
                <strong style="color:var(--hujariya-gold);">أولاً: الصفة غير الربحية</strong>
                <p>موسوعة الحجرية منصة ثقافية توثيقية غير ربحية بالكامل، ولا تمارس أي نشاط تجاري على المؤلفات المدرجة.</p>
            </div>
            <div class="citation-box">
                <strong style="color:var(--hujariya-gold);">ثانياً: حماية الملكية الفكرية والاستجابة للبلاغات</strong>
                <p>تلتزم الموسوعة بحقوق المؤلفين ودور النشر؛ ويحق لأي مؤلف أو دار نشر طلب تحويل الكتاب إلى «بطاقة توثيق موسوعي بدون تحميل» أو تعليقه فوراً عبر زر الإبلاغ المباشر المدمج في كل كتاب.</p>
            </div>
            <div class="citation-box">
                <strong style="color:var(--hujariya-gold);">ثالثاً: سياسة الخصوصية</strong>
                <p>تُستخدم بيانات تسجيل الدخول عبر جوجل حصرياً لحفظ مكتبتك المفضلة وتوثيق اسمك في لوحة الشرف ومتابعة مساهماتك.</p>
            </div>
        `;
        $("infoModal").style.display = "flex";
    });
}

if ($("closeInfoModal")) $("closeInfoModal").onclick = () => $("infoModal").style.display = "none";

// تثبيت تطبيق الويب التقدمي (PWA)
let deferredPwaPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
});

if ($("installPwaBtn")) {
    $("installPwaBtn").addEventListener("click", async () => {
        if (deferredPwaPrompt) {
            deferredPwaPrompt.prompt();
            deferredPwaPrompt = null;
        } else {
            alert("لتثبيت تطبيق موسوعة الحجرية على هاتفك: افتح قائمة المتصفح (النقاط الثلاث أعلى الشاشة) ثم اختر «الإضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».");
        }
    });
}

// تشغيل الموسوعة فور جاهزية الصفحة
fetchAllEncyclopediaData();
