import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import chalk from "chalk";

import { connectDB } from "./config/db.js";

import healthRoutes from "./routes/health.routes.js";
import dataRoutes from "./routes/data.routes.js";
import storageRoutes from "./routes/storage.routes.js";

dotenv.config();

const app = express();

const STORAGE_ROOT =
  process.env.FILE_STORAGE_ROOT || "/home/wahbani/storage";

await connectDB();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

//Request logs 
app.use((req, res, next) => {
  console.log("");
  console.log(chalk.blue("========== REQUEST =========="));
  
  console.log(chalk.green("TIME:"), new Date().toISOString());
  console.log(chalk.yellow("METHOD:"), req.method);
  console.log(chalk.cyan("URL:"), req.originalUrl);
  console.log(chalk.magenta("IP:"), req.ip);

  console.log(
    chalk.white("BODY:"),
    chalk.gray(JSON.stringify(req.body, null, 2))
  );

  console.log(chalk.blue("============================="));

  next();
});

//Response logs
app.use((req, res, next) => {
  const oldJson = res.json;

  res.json = function (data) {
    console.log("\n");
    
    console.log(chalk.gray("========== RESPONSE =========="));

    console.log(
      chalk.green("STATUS:"),
      chalk.yellow(res.statusCode)
    );

    console.log(
      chalk.cyan("URL:"),
      req.method,
      req.originalUrl
    );

    console.log(
      chalk.magenta("DATA:")
    );

    console.log(
      chalk.white(JSON.stringify(data, null, 2))
    );

    console.log(
      chalk.gray("==============================")
    );

    console.log("\n");

    return oldJson.call(this, data);
  };

  next();
});

app.use("/health", healthRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/storage", storageRoutes);

// static serving for real files
//app.use("/api/storage", express.static(path.resolve(STORAGE_ROOT)));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(chalk.bgRed.white(" ERROR "));
  console.error(chalk.red(err.message));
  console.error(chalk.gray(err.stack));

  res.status(500).json({
    success: false,
    error: err.message
  });
});
export default app;
