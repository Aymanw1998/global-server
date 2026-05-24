import express from "express";
import multer from "multer";
import {
  uploadFile,
  getUploadStatus,
  cancelUpload,
  getFile,
  deleteFile,
  listFiles,
  createFolder,
  uploadChunk,
  mergeChunks,
  renameF,
  getStorageStats,
} from "../controllers/storage.controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize:1024*1024*1024},
});
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024,
  },
});
router.get("/upload-status", getUploadStatus);
router.post("/cancel-upload", express.json({ limit: "1mb" }), cancelUpload);
router.get("/stats", getStorageStats);
router.get("/list", listFiles);
router.get("/file", getFile);
router.get("/file/:name", getFile);
router.post("/folder", createFolder);
router.post("/upload", upload.single("file"), uploadFile);
router.post("/upload-chunk", chunkUpload.single("chunk"), uploadChunk);
router.post("/merge-chunks", express.json({ limit: "5mb" }), mergeChunks);

router.patch("/rename", renameF);
router.delete("/delete", deleteFile);

export default router;
