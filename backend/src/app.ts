import express from "express";
import helmet from "helmet";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler.js";
import eventRoutes from "./routes/eventRoutes.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());




app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "FlashSale API is running!",
  });
});


app.use("/api/events", eventRoutes);


// Handle requests to nonexistent routes.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});
app.use(errorHandler);



export default app;