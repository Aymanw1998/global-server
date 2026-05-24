import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

const STORAGE_ROOT =
  process.env.FILE_STORAGE_ROOT || "/home/wahbani/storage";

const PUBLIC_BASE_URL =
  process.env.FILE_PUBLIC_BASE_URL || "https://api.wahbani.com/api/storage";

const STORAGE_SIGNED_URL_SECRET =
  process.env.STORAGE_SIGNED_URL_SECRET || "storage-temp-secret";

const TMP_CHUNKS_DIR = path.join(STORAGE_ROOT, ".tmp", "chunks");
const MAX_CHUNKS_PER_UPLOAD = Number(process.env.STORAGE_MAX_UPLOAD_CHUNKS || 2000);
const UPLOAD_CHUNK_TTL_MS =
  Number(process.env.STORAGE_UPLOAD_CHUNK_TTL_HOURS || 24) * 60 * 60 * 1000;

const REQUIRED_STORAGE_DIRS = [
  STORAGE_ROOT,
  path.join(STORAGE_ROOT, ".tmp"),
  TMP_CHUNKS_DIR,
  path.join(STORAGE_ROOT, "tamheed_db"),
  path.join(STORAGE_ROOT, "tamheed_db", "root"),
];

const UPLOAD_SESSION_FILE = ".upload-session.json";

function safeResolve(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);

  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid path");
  }

  return resolved;
}

function getProcessDetails() {
  return {
    cwd: process.cwd(),
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    gid: typeof process.getgid === "function" ? process.getgid() : null,
  };
}

function storagePermissionPayload(targetPath) {
  return {
    ok: false,
    success: false,
    message: "Storage directory is not writable",
    details: {
      storageRoot: STORAGE_ROOT,
      targetPath,
      ...getProcessDetails(),
    },
  };
}

async function mkdirStorageDir(dir) {
  console.info("[global-storage:mkdir]", {
    storageRoot: STORAGE_ROOT,
    targetPath: dir,
    ...getProcessDetails(),
  });

  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (error) {
    console.error("[global-storage:mkdir:error]", {
      code: error.code,
      message: error.message,
      storageRoot: STORAGE_ROOT,
      targetPath: dir,
      ...getProcessDetails(),
    });

    if (error.code === "EACCES") {
      error.storagePermission = true;
      error.targetPath = dir;
    }

    throw error;
  }
}

export async function ensureStorageDirectories() {
  console.info("[global-storage:init]", {
    storageRoot: STORAGE_ROOT,
    requiredDirs: REQUIRED_STORAGE_DIRS,
    ...getProcessDetails(),
  });

  for (const dir of REQUIRED_STORAGE_DIRS) {
    await mkdirStorageDir(dir);
  }
}

ensureStorageDirectories().catch((error) => {
  console.error("[global-storage:init:error]", {
    code: error.code,
    message: error.message,
    storageRoot: STORAGE_ROOT,
    targetPath: error.targetPath,
    ...getProcessDetails(),
  });
});

const cleanupOldChunkUploads = async () => {
  try {
    const entries = await fs.promises.readdir(TMP_CHUNKS_DIR, { withFileTypes: true });
    const now = Date.now();

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const dirPath = safeResolve(TMP_CHUNKS_DIR, entry.name);
          const stats = await fs.promises.stat(dirPath);
          const ageMs = now - stats.mtimeMs;

          if (ageMs > UPLOAD_CHUNK_TTL_MS) {
            await fs.promises.rm(dirPath, {
              recursive: true,
              force: true,
            });

            console.info("cleanup old chunk upload:", {
              uploadId: entry.name,
              ageMs,
            });
          }
        })
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("cleanupOldChunkUploads error:", error.message);
    }
  }
};

setInterval(cleanupOldChunkUploads, 60 * 60 * 1000).unref?.();
cleanupOldChunkUploads();

function verifyStorageAccessToken(token) {
  return jwt.verify(token, STORAGE_SIGNED_URL_SECRET, {
    algorithms: ["HS256"],
  });
}

function safeSegment(value = "") {
  return String(value)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/\.\./g, "")
        .replace(/[<>:"|?*\x00-\x1F]/g, "_")
        .trim()
    )
    .filter(Boolean)
    .join("/");
}

function safeName(name = "") {
  return String(name)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\.\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getExt(file) {
  const fromOriginal = path.extname(file.originalname || "");
  if (fromOriginal) return fromOriginal.toLowerCase();

  const mime = file.mimetype || "";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "application/pdf") return ".pdf";
  return "";
}

const normalizeRelativePath = (value = "") =>
  String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

function buildRelativeDir(dbName, collection, folder = "") {
  const safeDbName = safeSegment(dbName || "default_db");
  const safeCollection = safeSegment(collection || "default_collection");
  const safeFolder = safeSegment(folder || "");

  if (safeFolder) {
    return path.join(safeDbName, safeCollection, safeFolder);
  }

  return path.join(safeDbName, safeCollection);
}

function resolveSafePath(relativePath = "") {
  const cleanRelative = String(relativePath).replace(/^\/+/, "");
  const absolutePath = path.resolve(STORAGE_ROOT, cleanRelative);
  const rootPath = path.resolve(STORAGE_ROOT);

  if (absolutePath !== rootPath && !absolutePath.startsWith(rootPath + path.sep)) {
    throw new Error("Invalid path");
  }

  return absolutePath;
}

function fileToJson(relativePath, stats) {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = PUBLIC_BASE_URL.replace(/\/+$/, "");

  return {
    name: path.basename(normalized),
    relativePath: normalized,
    url: `${base}/${normalized}`,
    size: stats.size,
    ext: path.extname(normalized).toLowerCase(),
    modifiedAt: stats.mtime,
    createdAt: stats.birthtime,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
  };
}

const getStorageBasePath = ({ dbName = "", collection = "", folder = "" }) => {
  const safeDbName = safeSegment(dbName || "default_db");
  const safeCollection = safeSegment(collection || "root");
  const safeFolder = normalizeRelativePath(folder)
    .split("/")
    .filter(Boolean)
    .map(safeSegment)
    .join("/");

  return path.join(STORAGE_ROOT, safeDbName, safeCollection, safeFolder);
};

const getDirectorySize = async (dirPath) => {
  let total = 0;

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(fullPath);
        total += stat.size;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return total;
};

function safeUploadId(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 180);
}

async function removeDirSafe(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

const getChunkSessionDir = (uploadId = "") => {
  const safeId = safeUploadId(uploadId);
  if (!safeId) {
    throw new Error("Invalid uploadId");
  }

  return safeResolve(TMP_CHUNKS_DIR, safeId);
};

async function readUploadSession(chunksDir) {
  try {
    const raw = await fs.promises.readFile(
      path.join(chunksDir, UPLOAD_SESSION_FILE),
      "utf8"
    );
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeUploadSession(chunksDir, session) {
  await mkdirStorageDir(chunksDir);

  const now = new Date().toISOString();
  const previous = await readUploadSession(chunksDir).catch(() => null);

  const nextSession = {
    ...(previous || {}),
    ...session,
    receivedChunks: Array.from(
      new Set((session.receivedChunks || previous?.receivedChunks || []).map(Number))
    )
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };

  await fs.promises.writeFile(
    path.join(chunksDir, UPLOAD_SESSION_FILE),
    JSON.stringify(nextSession, null, 2)
  );

  return nextSession;
}

const readReceivedChunks = async (chunksDir) => {
  try {
    const entries = await fs.promises.readdir(chunksDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && /^\d+\.part$/.test(entry.name))
      .map((entry) => Number(entry.name.replace(".part", "")))
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => a - b);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

const buildMissingChunks = (receivedChunks = [], totalChunks = 0) => {
  const receivedSet = new Set(receivedChunks);
  const missingChunks = [];

  for (let index = 0; index < totalChunks; index += 1) {
    if (!receivedSet.has(index)) {
      missingChunks.push(index);
    }
  }

  return missingChunks;
};

export const getUploadStatus = async (req, res) => {
  try {
    const uploadId = String(req.query.uploadId || "").trim();

    if (!uploadId) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "uploadId is required",
      });
    }

    const safeId = safeUploadId(uploadId);
    const chunksDir = getChunkSessionDir(safeId);
    const session = await readUploadSession(chunksDir);
    const receivedChunks = await readReceivedChunks(chunksDir);

    const totalChunks = Number(session?.totalChunks || req.query.totalChunks || 0);
    const safeTotalChunks =
      Number.isInteger(totalChunks) && totalChunks > 0
        ? totalChunks
        : receivedChunks.length;

    return res.json({
      ok: true,
      success: true,
      uploadId: safeId,
      fileName: session?.fileName || "",
      totalChunks: safeTotalChunks,
      chunkSize: Number(session?.chunkSize || 0),
      path: session?.path || "",
      receivedChunks,
      missingChunks: buildMissingChunks(receivedChunks, safeTotalChunks),
      status: session?.status || (receivedChunks.length > 0 ? "uploading" : "not_found"),
      createdAt: session?.createdAt || null,
      updatedAt: session?.updatedAt || null,
    });
  } catch (error) {
    console.error("getUploadStatus error:", error);

    if (error.storagePermission || error.code === "EACCES") {
      return res.status(500).json(storagePermissionPayload(error.targetPath || TMP_CHUNKS_DIR));
    }

    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || "Failed to get upload status",
    });
  }
};

export const cancelUpload = async (req, res) => {
  try {
    const uploadId = String(req.body?.uploadId || req.query?.uploadId || "").trim();

    if (!uploadId) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "uploadId is required",
      });
    }

    const safeId = safeUploadId(uploadId);
    const chunksDir = getChunkSessionDir(safeId);

    await fs.promises.rm(chunksDir, {
      recursive: true,
      force: true,
    });

    return res.json({
      ok: true,
      success: true,
      uploadId: safeId,
      status: "canceled",
      deleted: true,
    });
  } catch (error) {
    console.error("cancelUpload error:", error);

    if (error.storagePermission || error.code === "EACCES") {
      return res.status(500).json(storagePermissionPayload(error.targetPath || TMP_CHUNKS_DIR));
    }

    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || "Failed to cancel upload",
    });
  }
};

export const uploadChunk = async (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks } = req.body;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, success: false, message: "chunk required" });
    }

    const safeId = safeUploadId(uploadId);
    const index = Number(chunkIndex);
    const total = Number(totalChunks);

    console.info("[global-storage:chunk:start]", {
      uploadId: safeId,
      chunkIndex: index,
      totalChunks: total,
      size: req.file.size,
      storageRoot: STORAGE_ROOT,
      ...getProcessDetails(),
    });

    if (!safeId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
      return res.status(400).json({ ok: false, success: false, message: "invalid chunk metadata" });
    }

    if (total > MAX_CHUNKS_PER_UPLOAD || index < 0 || index >= total) {
      return res.status(400).json({ ok: false, success: false, message: "invalid chunk index" });
    }

    await ensureStorageDirectories();

    const chunksDir = safeResolve(TMP_CHUNKS_DIR, safeId);
    await mkdirStorageDir(chunksDir);

    const chunkPath = safeResolve(chunksDir, `${index}.part`);
    await fs.promises.writeFile(chunkPath, req.file.buffer);

    const previousSession = await readUploadSession(chunksDir);
    const previousReceived = previousSession?.receivedChunks || [];
    const nextReceived = Array.from(new Set([...previousReceived, index]));

    await writeUploadSession(chunksDir, {
      uploadId: safeId,
      fileName: safeName(req.body.fileName || "file"),
      totalChunks: total,
      chunkSize: Number(req.body.chunkSize || req.file.size || 0),
      path: normalizeRelativePath(req.body.path || req.body.folder || ""),
      status: "uploading",
      receivedChunks: nextReceived,
    });

    console.info("[global-storage:chunk:saved]", {
      uploadId: safeId,
      chunkIndex: index,
      totalChunks: total,
      chunkPath,
      size: req.file.size,
    });

    return res.json({
      ok: true,
      success: true,
      uploadId: safeId,
      chunkIndex: index,
      totalChunks: total,
      receivedBytes: req.file.size,
    });
  } catch (err) {
    console.error("uploadChunk error:", err);

    if (err.storagePermission || err.code === "EACCES") {
      return res.status(500).json(storagePermissionPayload(err.targetPath || TMP_CHUNKS_DIR));
    }

    return res.status(500).json({
      ok: false,
      success: false,
      message: err.message || "Upload chunk failed",
    });
  }
};

export const mergeChunks = async (req, res) => {
  try {
    const {
      uploadId,
      fileName,
      totalChunks,
      dbName,
      collection,
      folder = "",
      mimeType = "",
    } = req.body || {};

    const safeId = safeUploadId(uploadId);
    const total = Number(totalChunks);
    const finalFileName = safeName(path.basename(String(fileName || "file")));

    if (!safeId || !finalFileName || !Number.isInteger(total) || total <= 0) {
      return res.status(400).json({ ok: false, success: false, message: "invalid merge metadata" });
    }

    if (total > MAX_CHUNKS_PER_UPLOAD) {
      return res.status(400).json({ ok: false, success: false, message: "too many chunks" });
    }

    if (!dbName) {
      return res.status(400).json({ ok: false, success: false, message: "dbName is required" });
    }

    if (!collection) {
      return res.status(400).json({ ok: false, success: false, message: "collection is required" });
    }

    const chunksDir = resolveSafePath(path.join(".tmp", "chunks", safeId));

    for (let i = 0; i < total; i += 1) {
      const chunkPath = resolveSafePath(path.join(".tmp", "chunks", safeId, `${i}.part`));
      await fs.promises.access(chunkPath, fs.constants.R_OK);
    }

    const relativeDir = buildRelativeDir(dbName, collection, folder);
    const absoluteDir = resolveSafePath(relativeDir);
    await mkdirStorageDir(absoluteDir);

    const finalRelativePath = path.join(relativeDir, finalFileName).replace(/\\/g, "/");
    const finalPath = resolveSafePath(finalRelativePath);

    const writeStream = fs.createWriteStream(finalPath);

    try {
      for (let i = 0; i < total; i += 1) {
        const chunkPath = resolveSafePath(path.join(".tmp", "chunks", safeId, `${i}.part`));

        await new Promise((resolve, reject) => {
          const readStream = fs.createReadStream(chunkPath);
          readStream.on("error", reject);
          readStream.on("end", resolve);
          readStream.pipe(writeStream, { end: false });
        });
      }

      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        writeStream.end();
      });
    } catch (err) {
      writeStream.destroy();
      throw err;
    }

    const stats = await fs.promises.stat(finalPath);

    await writeUploadSession(chunksDir, {
      uploadId: safeId,
      fileName: finalFileName,
      totalChunks: total,
      chunkSize: 0,
      path: normalizeRelativePath(folder),
      status: "completed",
      receivedChunks: Array.from({ length: total }, (_, index) => index),
    });

    await removeDirSafe(chunksDir);

    const base = PUBLIC_BASE_URL.replace(/\/+$/, "");

    return res.status(201).json({
      ok: true,
      success: true,
      provider: "local",
      fileName: finalFileName,
      filename: finalFileName,
      mimetype: mimeType,
      mimeType,
      size: stats.size,
      dbName: safeSegment(dbName),
      collection: safeSegment(collection),
      folder: folder ? safeSegment(folder) : "",
      relativePath: finalRelativePath,
      path: finalRelativePath,
      absolutePath: finalPath,
      url: `${base}/${finalRelativePath}`,
      secure_url: `${base}/${finalRelativePath}`,
    });
  } catch (err) {
    console.error("mergeChunks error:", err);

    if (err.storagePermission || err.code === "EACCES") {
      return res.status(500).json(storagePermissionPayload(err.targetPath || STORAGE_ROOT));
    }

    if (err.code === "ENOENT") {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "missing chunk",
      });
    }

    return res.status(500).json({
      ok: false,
      success: false,
      message: err.message || "Merge chunks failed",
    });
  }
};

export const getStorageStats = async (req, res) => {
  try {
    const targetPath = getStorageBasePath({
      dbName: req.query.dbName,
      collection: req.query.collection,
      folder: req.query.folder,
    });

    const diskStats = await fs.promises.statfs(STORAGE_ROOT);
    const blockSize = Number(diskStats.bsize || 0);
    const serverTotalBytes = Number(diskStats.blocks || 0) * blockSize;
    const serverFreeBytes = Number(diskStats.bavail ?? diskStats.bfree ?? 0) * blockSize;
    const serverUsedBytes = Math.max(serverTotalBytes - serverFreeBytes, 0);
    const tamheedUsedBytes = await getDirectorySize(targetPath);
    const tamheedAvailableBytes = serverFreeBytes;
    const tamheedTotalBytes = tamheedUsedBytes + serverFreeBytes;

    return res.json({
      ok: true,
      success: true,
      storageRoot: STORAGE_ROOT,
      targetPath,
      serverTotalBytes,
      serverUsedBytes,
      serverFreeBytes,
      tamheedUsedBytes,
      tamheedAvailableBytes,
      tamheedTotalBytes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to calculate storage stats",
    });
  }
};

export const uploadFile = async (req, res) => {
  try {
    const { dbName, collection, folder = "" } = req.body;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: "Missing file buffer",
      });
    }

    req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8");

    if (!dbName) {
      return res.status(400).json({
        success: false,
        error: "dbName is required",
      });
    }

    if (!collection) {
      return res.status(400).json({
        success: false,
        error: "collection is required",
      });
    }

    const ext = getExt(req.file);
    const originalBase = path.basename(
      req.file.originalname || "file",
      path.extname(req.file.originalname || "")
    );
    const cleanBase = safeName(originalBase || "file");
    const filename = `${cleanBase}${ext}`;

    const relativeDir = buildRelativeDir(dbName, collection, folder);
    const absoluteDir = resolveSafePath(relativeDir);
    const absolutePath = path.join(absoluteDir, filename);

    await mkdirStorageDir(absoluteDir);
    await fs.promises.writeFile(absolutePath, req.file.buffer);

    const relativePath = path.join(relativeDir, filename).replace(/\\/g, "/");

    return res.status(200).json({
      success: true,
      provider: "local",
      filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      dbName: safeSegment(dbName),
      collection: safeSegment(collection),
      folder: folder ? safeSegment(folder) : "",
      relativePath,
      absolutePath,
      url: `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/${relativePath}`,
      secure_url: `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/${relativePath}`,
    });
  } catch (err) {
    console.error("uploadFile error:", err);

    if (err.storagePermission || err.code === "EACCES") {
      return res.status(500).json(storagePermissionPayload(err.targetPath || STORAGE_ROOT));
    }

    return res.status(500).json({
      success: false,
      error: err.message || "Upload failed",
    });
  }
};

export const getFile = async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "token is required",
      });
    }

    const payload = verifyStorageAccessToken(token);
    const relativePath = String(payload.path || "").trim();
    const download =
      String(req.query.download || "") === "1" || Boolean(payload.download);
    const displayName = String(payload.displayName || "").trim();

    if (!relativePath) {
      return res.status(400).json({
        success: false,
        error: "Invalid token payload",
      });
    }

    const absolutePath = resolveSafePath(relativePath);
    const stats = await fs.promises.stat(absolutePath);

    if (!stats.isFile()) {
      return res.status(400).json({
        success: false,
        error: "Target is not a file",
      });
    }

    const fileName = displayName || path.basename(absolutePath);

    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    return res.sendFile(absolutePath);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Signed link expired",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: "Invalid signed link",
      });
    }

    if (error.code === "ENOENT") {
      return res.status(404).json({
        success: false,
        error: "File not found",
      });
    }

    console.error("getFile error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Read file failed",
    });
  }
};

export const renameF = async (req, res) => {
  try {
    const { relativePath, newName } = req.body || {};

    if (!relativePath || !newName) {
      return res.status(400).json({
        success: false,
        error: "relativePath and newName are required",
      });
    }

    const safeRelative = String(relativePath).replace(/^\/+/, "");
    const absoluteOldPath = resolveSafePath(safeRelative);
    const stats = await fs.promises.stat(absoluteOldPath);
    const dir = path.dirname(absoluteOldPath);

    const safeNewName = stats.isDirectory()
      ? safeName(newName)
      : `${safeName(path.basename(newName, path.extname(newName)))}${path.extname(newName) || path.extname(absoluteOldPath)}`;

    if (!safeNewName) {
      return res.status(400).json({
        success: false,
        error: "Invalid newName",
      });
    }

    const absoluteNewPath = path.join(dir, safeNewName);
    const newRelativePath = path.relative(STORAGE_ROOT, absoluteNewPath).replace(/\\/g, "/");

    resolveSafePath(newRelativePath);

    try {
      await fs.promises.access(absoluteNewPath);
      return res.status(409).json({
        success: false,
        error: "Target already exists",
      });
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    await fs.promises.rename(absoluteOldPath, absoluteNewPath);

    return res.status(200).json({
      success: true,
      oldRelativePath: safeRelative,
      newRelativePath,
      name: safeNewName,
      type: stats.isDirectory() ? "directory" : "file",
      url: stats.isFile()
        ? `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/${newRelativePath}`
        : null,
    });
  } catch (error) {
    console.error("rename error:", error);

    if (error.code === "ENOENT") {
      return res.status(404).json({
        success: false,
        error: "Source not found",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Rename failed",
    });
  }
};

export const deleteFile = async (req, res) => {
  try {
    const { url, relativePath } = req.body || {};
    let rel = String(relativePath || url || "").trim();

    if (!rel) {
      return res.status(400).json({
        success: false,
        error: "url or relativePath is required",
      });
    }

    const publicBase = PUBLIC_BASE_URL.replace(/\/+$/, "");
    if (rel.startsWith(publicBase)) {
      rel = rel.slice(publicBase.length);
    }

    rel = rel.replace(/^\/+/, "");
    const absolutePath = resolveSafePath(rel);
    const stats = await fs.promises.stat(absolutePath);

    if (!stats.isFile() && !stats.isDirectory()) {
      return res.status(400).json({
        success: false,
        error: "Target is not a file or folder",
      });
    }

    if (stats.isFile()) {
      await fs.promises.unlink(absolutePath);

      return res.status(200).json({
        success: true,
        deleted: true,
        type: "file",
        path: rel,
      });
    }

    if (stats.isDirectory()) {
      await fs.promises.rm(absolutePath, {
        recursive: true,
        force: true,
      });

      return res.status(200).json({
        success: true,
        deleted: true,
        type: "directory",
        path: rel,
      });
    }

    return res.status(400).json({
      success: false,
      error: "Unknown target type",
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(200).json({
        success: true,
        deleted: false,
        message: "File or folder not found",
      });
    }

    console.error("deleteFile error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Delete failed",
    });
  }
};

export const createFolder = async (req, res) => {
  try {
    const { dbName, collection, folder = "" } = req.body || {};

    if (!dbName) {
      return res.status(400).json({
        success: false,
        error: "dbName is required",
      });
    }

    if (!collection) {
      return res.status(400).json({
        success: false,
        error: "collection is required",
      });
    }

    const relativeDir = buildRelativeDir(dbName, collection, folder);
    const absoluteDir = resolveSafePath(relativeDir);

    await mkdirStorageDir(absoluteDir);

    return res.status(200).json({
      success: true,
      created: true,
      relativePath: relativeDir.replace(/\\/g, "/"),
      absolutePath: absoluteDir,
    });
  } catch (err) {
    console.error("createFolder error:", err);

    if (err.storagePermission || err.code === "EACCES") {
      return res.status(500).json(storagePermissionPayload(err.targetPath || STORAGE_ROOT));
    }

    return res.status(500).json({
      success: false,
      error: err.message || "Create folder failed",
    });
  }
};

export const listFiles = async (req, res) => {
  try {
    const { dbName, collection, folder = "" } = req.query;

    if (!dbName) {
      return res.status(400).json({
        success: false,
        error: "dbName is required",
      });
    }

    if (!collection) {
      return res.status(400).json({
        success: false,
        error: "collection is required",
      });
    }

    const relativeDir = buildRelativeDir(dbName, collection, folder);
    const absoluteDir = resolveSafePath(relativeDir);

    let entries = [];
    try {
      entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.status(200).json({
          success: true,
          path: relativeDir.replace(/\\/g, "/"),
          items: [],
        });
      }
      throw err;
    }

    const items = [];
    for (const entry of entries) {
      const entryRelativePath = path
        .join(relativeDir, entry.name)
        .replace(/\\/g, "/");
      const entryAbsolutePath = resolveSafePath(entryRelativePath);
      const stats = await fs.promises.stat(entryAbsolutePath);

      items.push(fileToJson(entryRelativePath, stats));
    }

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });

    return res.status(200).json({
      success: true,
      path: relativeDir.replace(/\\/g, "/"),
      items,
    });
  } catch (err) {
    console.error("listFiles error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "List files failed",
    });
  }
};
