require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");



const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// 🧾 REDIRECT FLOW: Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const items = req.body.items || [];

  const line_items = items.map((item) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: item.title,
        description: item.description || "",
      },
      unit_amount: Math.round(Number(item.price || 0) * 100),
    },
    quantity: 1,
  }));

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe Checkout Session Error:", err);
    res.status(500).json({ error: "Checkout session failed" });
  }
});

// 💳 EMBEDDED FLOW: PaymentIntent
app.post("/create-payment-intent", async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(amount)) {
    return res.status(400).json({ error: "Invalid amount." });
  }

  try {
    const subtotal = Math.round(amount); // in cents
    const taxRate = 0.0625;
    const taxAmount = Math.round(subtotal * taxRate);
    const total = subtotal + taxAmount;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Error creating PaymentIntent:", err);
    res.status(500).json({ error: "Failed to create PaymentIntent" });
  }
});

// 📧 SEND RECEIPT AFTER PAYMENT
app.post("/send-receipt", async (req, res) => {
  const { to, items, subtotal, tax, totalAmount } = req.body;

  console.log("📩 Email receipt request:", to);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const logoUrl = "https://stephenscode.com/logo512.png";
  const html = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <img src="${logoUrl}" alt="StephensCode Logo" style="max-height: 60px; margin-bottom: 20px;" />
      <h2>Thank you for your purchase!</h2>
      <p>Here is your receipt:</p>
      <ul>
        ${items.map(item => `<li><strong>${item.title}</strong> — $${item.price}</li>`).join("")}
      </ul>
      <p><strong>Subtotal:</strong> $${subtotal.toFixed(2)}</p>
      <p><strong>Tax (6.25%):</strong> $${tax.toFixed(2)}</p>
      <p><strong>Total:</strong> $${totalAmount.toFixed(2)}</p>
      <p>If you have any questions, just reply to this email.</p>
    </div>
  `;

  // ✅ Generate PDF
  const pdfPath = path.join(__dirname, "receipt.pdf");
const doc = new PDFDocument({ margin: 50 });

doc.pipe(fs.createWriteStream(pdfPath));

// 🔶 Accent Header Bar
doc.rect(0, 0, doc.page.width, 60).fill("#F97316"); // Tailwind's orange-500
doc.fillColor("white").fontSize(20).font("Helvetica-Bold").text("StephensCode", 50, 20);

// 🖼️ Logo (optional, below accent)
doc.image("public/stephenscode-logo.png", doc.page.width - 150, 15, { width: 100 });

// 🧾 Receipt Heading
doc.moveDown(3);
doc.fillColor("black").font("Helvetica-Bold").fontSize(18).text("Purchase Receipt");
doc.font("Helvetica").fontSize(10).fillColor("gray").text(`Date: ${new Date().toLocaleString()}`);
doc.moveDown(1);

// 📦 Line Items
doc.font("Helvetica-Bold").fillColor("black").text("Items Purchased", { underline: true });
doc.moveDown(0.5);

items.forEach((item) => {
  doc.font("Helvetica-Bold").fontSize(12).fillColor("black").text(item.title);
  if (item.description) {
    doc.font("Helvetica").fontSize(10).fillColor("gray").text(item.description, { indent: 20 });
  }
  doc.font("Helvetica").fontSize(11).fillColor("black").text(`$${Number(item.price).toFixed(2)}`, {
    align: "right",
  });
  doc.moveDown(0.8);
});

// 💵 Totals
doc.moveDown(1.5);
doc.font("Helvetica-Bold").fontSize(12).fillColor("black");
doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: "right" });
doc.text(`Tax (6.25%): $${tax.toFixed(2)}`, { align: "right" });
doc.text(`Total: $${totalAmount.toFixed(2)}`, { align: "right" });

doc.moveDown(2);

// 📬 Footer With Links
doc.font("Helvetica").fontSize(10).fillColor("gray");
doc.text("Thank you for your business.", { align: "center" });
doc.text("Need help? Visit ", { continued: true, align: "center" })
   .fillColor("blue").text("https://stephenscode.com", { link: "https://stephenscode.com", continued: true })
   .fillColor("gray").text(" or email ", { continued: true })
   .fillColor("blue").text("support@stephenscode.com", {
     link: "mailto:support@stephenscode.com",
     align: "center",
   });

doc.end();

  // ✅ Send email
  try {
    const result = await transporter.sendMail({
      from: `"StephensCode" <${process.env.GMAIL_USER}>`,
      to,
      bcc: "admin@stephenscode.dev",
      subject: "Your Receipt from StephensCode",
      html,
      attachments: [
        {
          filename: "receipt.pdf",
          path: pdfPath,
        },
      ],
    });

    console.log("✅ Email sent:", result.accepted);
    res.send({ success: true });
  } catch (err) {
    console.error("❌ Email error:", err);
    res.status(500).json({ error: "Failed to send receipt email." });
  }
});

// 🌐 Default route
app.get("/", (req, res) => {
  res.send("StephensCode Stripe Server is running.");
});

// 🚀 Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

console.log("Using Stripe key:", process.env.STRIPE_SECRET_KEY);
