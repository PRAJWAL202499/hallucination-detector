require("dotenv").config();
const express = require("express");
const cors = require("cors");
const verifyRouter = require("./routes/verify");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/verify", verifyRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
