import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to read database
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error("Error reading database file, returning empty array:", e);
    return [];
  }
}

// Helper to write database
function writeDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing database file:", e);
  }
}

// Ensure database file exists with some initial data if empty
if (!fs.existsSync(DB_FILE) || readDB().length === 0) {
  const initialBookings = [
    {
      id: "book-1",
      patientName: "سلمان محمد العمري",
      phone: "0512345678",
      gender: "ذكر",
      specialtyId: "surgery",
      doctorId: "doc-dawidar",
      date: new Date().toISOString().split("T")[0],
      timeSlot: "05:30 م",
      status: "completed",
      queueNumber: 1,
      createdAt: new Date().toISOString(),
      notes: "استشارة لزراعة ضرسين تالفين وفحص كثافة العظام عبر الأشعة ثلاثية الأبعاد.",
      isArrived: true,
      arrivedAt: new Date().toISOString()
    },
    {
      id: "book-2",
      patientName: "هند خالد العتيبي",
      phone: "0544558899",
      gender: "أنثى",
      specialtyId: "ortho",
      doctorId: "doc-mona",
      date: new Date().toISOString().split("T")[0],
      timeSlot: "07:00 م",
      status: "in-progress",
      queueNumber: 2,
      createdAt: new Date().toISOString(),
      notes: "ضبط وشد سلك تقويم الأسنان المعدني العلوي ومراجعة الأطراف الدقيقة.",
      isArrived: true,
      arrivedAt: new Date().toISOString()
    },
    {
      id: "book-3",
      patientName: "وليد عبد الرحمن آل سعود",
      phone: "0555667788",
      gender: "ذكر",
      specialtyId: "endo",
      doctorId: "doc-yasser",
      date: new Date().toISOString().split("T")[0],
      timeSlot: "08:30 م",
      status: "waiting",
      queueNumber: 3,
      createdAt: new Date().toISOString(),
      notes: "ألم مستمر وشديد جداً يزداد ليلاً ويشتد مع المشروبات الباردة والساخنة.",
      isArrived: false
    }
  ];
  writeDB(initialBookings);
}

// API Routes
app.get("/api/bookings", (req, res) => {
  const db = readDB();
  res.json(db);
});

app.get("/api/external-services-test", async (req, res) => {
  try {
    const apexRes = await fetch("https://oracleapex.com/ords/nerd_acc/dentaldata/dental", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    
    if (!apexRes.ok) {
      throw new Error(`HTTP error status ${apexRes.status}`);
    }
    
    const data = await apexRes.json();
    res.json(data);
  } catch (error: any) {
    console.error("[PROXY_ERROR] Failed fetching from Oracle APEX:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bookings", (req, res) => {
  const { patientName, phone, gender, specialtyId, doctorId, date, timeSlot, notes, serviceName: clientServiceName } = req.body;
  if (!patientName || !phone || !date || !timeSlot) {
    return res.status(400).json({ error: "بيانات الحجز ناقصة" });
  }

  const db = readDB();
  const sameDay = db.filter((b: any) => b.date === date);
  const queueNumber = sameDay.length > 0 ? Math.max(...sameDay.map((b: any) => b.queueNumber || 0)) + 1 : 1;

  const newBooking = {
    id: `book-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    patientName,
    phone,
    gender: gender || "ذكر",
    specialtyId,
    doctorId,
    date,
    timeSlot,
    notes: notes || "",
    status: "waiting",
    queueNumber,
    createdAt: new Date().toISOString(),
    isArrived: false,
    arrivedAt: null
  };

  db.push(newBooking);
  writeDB(db);

  console.log(`[API_SUCCESS] New Booking registered via REST: ${patientName} (${phone})`);

  // Map specialtyId to readable Service Name
  const specialitiesMap: Record<string, string> = {
    'surgery': 'زراعة الأسنان وجراحة الفكين',
    'ortho': 'تقويم الأسنان وتجميل الابتسامة',
    'endo': 'علاج جذور وعصب الأسنان مجهرياً',
    'cosmetic': 'تبييض الأسنان بالليزر وتجميل الابتسامة',
    'pediatric': 'عناية وقائية وترميمية لأسنان الأطفال',
    'periodontics': 'تنظيف الجير وعلاج أمراض اللثة'
  };
  const serviceName = clientServiceName || specialitiesMap[specialtyId] || 'دكتور حازم دويدار - كشف أسنان عام';

  // Send server-side POST to the Oracle APEX API to bypass any CORS restrictions perfectly
  const apexApiUrl = "https://oracleapex.com/ords/nerd_acc/dentaldata/dental";
  const apexPayload = {
    patientName,
    phone,
    gender: gender || "ذكر",
    serviceName,
    date,
    timeSlot,
    notes: notes || "طلب حجز أسنان فوري"
  };

  fetch(apexApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(apexPayload)
  })
  .then(async (apexRes) => {
    const text = await apexRes.text();
    console.log(`[ORACLE APEX SYNC] Server-side request completed with status: ${apexRes.status}. Response:`, text);
  })
  .catch((err) => {
    console.error("[ORACLE APEX SYNC] Server-side request failed:", err.message);
  });

  res.status(201).json(newBooking);
});

// Confirm arrival API endpoint
app.post("/api/bookings/:id/arrive", (req, res) => {
  const { id } = req.params;
  const db = readDB();
  let found = false;
  let updatedBooking = null;

  const updatedDB = db.map((booking: any) => {
    if (booking.id === id) {
      found = true;
      updatedBooking = {
        ...booking,
        status: booking.status === "waiting" ? "in-progress" : booking.status,
        isArrived: true,
        arrivedAt: new Date().toISOString()
      };
      return updatedBooking;
    }
    return booking;
  });

  if (!found) {
    return res.status(404).json({ error: "الحجز غير موجود" });
  }

  writeDB(updatedDB);
  console.log(`[API_SUCCESS] Patient arrival confirmed! Transferred data to DB with payload:`, updatedBooking);
  res.json({ success: true, booking: updatedBooking });
});

// Update status endpoint
app.post("/api/bookings/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const db = readDB();
  let found = false;
  let updatedBooking = null;

  const updatedDB = db.map((booking: any) => {
    if (booking.id === id) {
      found = true;
      updatedBooking = {
        ...booking,
        status
      };
      return updatedBooking;
    }
    return booking;
  });

  if (!found) {
    return res.status(404).json({ error: "الحجز غير موجود" });
  }

  writeDB(updatedDB);
  res.json({ success: true, booking: updatedBooking });
});

// Delete endpoint
app.delete("/api/bookings/:id", (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const filtered = db.filter((booking: any) => booking.id !== id);
  writeDB(filtered);
  res.json({ success: true });
});

// Reset endpoint
app.post("/api/bookings/reset", (req, res) => {
  writeDB([]);
  res.json({ success: true });
});

// Explicit sitemap.xml fallback endpoint
app.get("/sitemap.xml", (req, res) => {
  const fileInDist = path.join(process.cwd(), "dist", "sitemap.xml");
  const fileInPublic = path.join(process.cwd(), "public", "sitemap.xml");
  const filePath = fs.existsSync(fileInDist) ? fileInDist : fileInPublic;

  if (fs.existsSync(filePath)) {
    res.header("Content-Type", "application/xml; charset=utf-8");
    res.sendFile(filePath);
  } else {
    res.status(404).end();
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
