// server.js
// Node 18+ recommended
import express from "express";
import crypto from "crypto";
import 'dotenv/config';


const app = express();
const PORT = process.env.PORT || 3000;

// Nếu Infobip POST application/json
app.use(express.json({ type: ["application/json", "application/*+json"] }));

/**
 * (Tuỳ chọn) Bảo mật webhook:
 * 1) Đặt một "shared secret" và yêu cầu Infobip gọi kèm header Authorization: Bearer <token>
 * 2) Hoặc xác thực chữ ký HMAC nếu bạn tự thêm reverse proxy tạo chữ ký trước khi vào app
 *    (Infobip không áp chữ ký bắt buộc; bạn có thể bảo vệ bằng Basic/Bearer ở phía mình).
 */
const WEBHOOK_BEARER = process.env.WEBHOOK_BEARER || null;

function requireAuth(req, res, next) {
  if (!WEBHOOK_BEARER) return next(); // không bật auth
  const auth = req.headers.authorization || "";
  const ok = auth === `Bearer ${WEBHOOK_BEARER}`;
  if (!ok) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// Helper: luôn chuẩn hoá payload về mảng events
function toEvents(body) {
  // Infobip thường bọc trong { results: [...] } hoặc gửi thẳng là mảng
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.results)) return body.results;
  return [body];
}

// Logging an toàn (không log PII quá mức trong production)
function safeLog(label, payload) {
  console.log(`[${new Date().toISOString()}] ${label}`);
  console.dir(payload, { depth: 5 });
}

/**
 * 1) INBOUND MESSAGE WEBHOOK
 *    Doc: Receive WhatsApp inbound messages
 *    URL gợi ý: /webhooks/whatsapp/inbound
 */
app.post("/webhooks/whatsapp/inbound", requireAuth, (req, res) => {
  const events = toEvents(req.body);

  // Ví dụ xử lý cơ bản
  for (const ev of events) {
    // Thường có các trường như: messageId, from, to, receivedAt, message{type,text,...}
    // Bạn nên lưu DB/queue để xử lý async
    safeLog("INBOUND", ev);
  }

  // Trả 200 thật nhanh, xử lý nặng làm async
  res.status(200).json({ received: true });
});

/**
 *  received status REPORTS WEBHOOK
 *    Doc: Receive WhatsApp status reports
 *    URL gợi ý: /webhooks/whatsapp/status
 */
app.post("/webhooks/whatsapp/status", requireAuth, (req, res) => {
    const events = toEvents(req.body);
  
    for (const ev of events) {
      // Trường hay gặp: messageId, to, sentAt/doneAt, status{groupId, groupName, id, name, description}
      safeLog("STATUS", ev);
      // Cập nhật trạng thái vào DB theo messageId
    }
  
    res.status(200).json({ received: true });
});

/**
 * 2) DELIVERY REPORTS WEBHOOK
 *    Doc: Receive WhatsApp delivery reports
 *    URL gợi ý: /webhooks/whatsapp/status/delivery
 */
app.post("/webhooks/whatsapp/status/delivery", requireAuth, (req, res) => {
  const events = toEvents(req.body);

  for (const ev of events) {
    // Trường hay gặp: messageId, to, sentAt/doneAt, status{groupId, groupName, id, name, description}
    safeLog("DELIVERY", ev);
    // Cập nhật trạng thái vào DB theo messageId
  }

  res.status(200).json({ received: true });
});

/**
 * 3) SEEN REPORTS WEBHOOK
 *    Doc: Receive WhatsApp seen reports
 *    URL gợi ý: /webhooks/whatsapp/status/seen
 *    Lưu ý: "Seen" tuỳ hỗ trợ, cần bật read receipts phía người nhận. (xem docs)
 */
app.post("/webhooks/whatsapp/status/seen", requireAuth, (req, res) => {
  const events = toEvents(req.body);

  for (const ev of events) {
    // Thường có trường thời điểm seen, id tin nhắn, v.v.
    safeLog("SEEN", ev);
    // Ghi nhận đã xem để dashboard/analytics
  }

  res.status(200).json({ received: true });
});

/**
 * 4) PAYMENT NOTIFICATION WEBHOOK
 *    Doc: Receive WhatsApp Payment Notification
 *    URL gợi ý: /webhooks/whatsapp/payments
 *    Lưu ý: Tính năng Payments cần enable & có PSP phù hợp (Brazil/India, v.v.)
 */
app.post("/webhooks/whatsapp/payments", requireAuth, (req, res) => {
  const events = toEvents(req.body);

  for (const ev of events) {
    // Trường ví dụ: payment.transactionId / status / amount / currency / metadata...
    safeLog("PAYMENT", ev);
    // Cập nhật đơn hàng, gửi order message khi confirmed
  }

  res.status(200).json({ received: true });
});

/**
 * 5) MARKETING UPDATE NOTIFICATION WEBHOOK
 *    Doc: Receive WhatsApp Marketing Update Notification
 *    URL gợi ý: /webhooks/whatsapp/marketing
 *    Dùng để nhận thay đổi opt-in/out marketing template messages của end user.
 */
app.post("/webhooks/whatsapp/marketing", requireAuth, (req, res) => {
  const events = toEvents(req.body);

  for (const ev of events) {
    // Trường ví dụ: subscription.status (OPT_IN / OPT_OUT), msisdn/waId,...
    safeLog("MARKETING_UPDATE", ev);
    // Đồng bộ trạng thái subscription trong CRM/DB (đừng nhắn marketing cho user đã opt-out)
  }

  res.status(200).json({ received: true });
});

// Health check
app.get("/", (_req, res) => res.send("OK"));

app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log("Endpoints:");
  console.log("  POST /webhooks/whatsapp/inbound");
  console.log("  POST /webhooks/whatsapp/status");
  console.log("  POST /webhooks/whatsapp/status/delivery");
  console.log("  POST /webhooks/whatsapp/status/seen");
  console.log("  POST /webhooks/whatsapp/payments");
  console.log("  POST /webhooks/whatsapp/marketing");
});
