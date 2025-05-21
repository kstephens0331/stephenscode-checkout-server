const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// ✅ Stripe Checkout Session: Redirect Flow
app.post("/create-checkout-session", async (req, res) => {
  const { items, email } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: items.map((item) => ({
        price_data: {
          currency: "usd",
          unit_amount: Math.round(item.price * 100),
          product_data: {
            name: item.title,
            description: item.description,
          },
        },
        quantity: 1,
      })),
      metadata: {
        source: "StephensCode Cart",
      },
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe Checkout Session Error:", err);
    res.status(500).json({ error: "Checkout session failed" });
  }
});

// 🌐 Default Route
app.get("/", (req, res) => {
  res.send("✅ StephensCode Checkout API is live.");
});

// ✅ Start Server
const PORT = 443;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
