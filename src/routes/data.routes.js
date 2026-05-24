import express from "express";
import { authService } from "../middleware/authService.js";
import {
  createData,
  readData,
  updateData,
  deleteData
} from "../controllers/data.controller.js";

const router = express.Router();

//router.use(authService);

router.post("/create", createData);
router.post("/read", readData);
router.post("/update", updateData);
router.post("/delete", deleteData);

export default router;
