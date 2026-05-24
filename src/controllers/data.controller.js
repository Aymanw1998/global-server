import { isValidDbName, isValidCollectionName } from "../utils/validateNames.js";
import { create, read, update, remove } from "../services/data.service.js";

export const createData = async (req, res) => {
  try {
    const { dbName, collection, data } = req.body;

    if (false /*!req.permissions?.create*/) {
      return res.status(403).json({
        success: false,
        error: "Create permission denied"
      });
    }

    if (!isValidDbName(dbName)) {
      return res.status(400).json({
        success: false,
        error: "Invalid dbName"
      });
    }

    if (!isValidCollectionName(collection)) {
      return res.status(400).json({
        success: false,
        error: "Invalid collection name"
      });
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: "data must be an object"
      });
    }

    const result = await create({ dbName, collection, data });

    return res.status(201).json({
      success: true,
      service: req.serviceName,
      dbName,
      collection,
      insertedId: result.insertedId
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const readData = async (req, res) => {
  try {
    const { dbName, collection, filter = {} } = req.body;
    console.log("dbName", dbName, "collection", collection);
    console.log("req.permissions?", req.permissions);
    if (false /*!req.permissions?.read*/) {
      return res.status(403).json({
        success: false,
        error: "Read permission denied"
      });
    }

    if (!isValidDbName(dbName)) {
      return res.status(400).json({
        success: false,
        error: "Invalid dbName"
      });
    }

    if (!isValidCollectionName(collection)) {
      return res.status(400).json({
        success: false,
        error: "Invalid collection name"
      });
    }

    if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
      return res.status(400).json({
        success: false,
        error: "filter must be an object"
      });
    }

    const result = await read({ dbName, collection, filter });

    return res.status(200).json({
      success: true,
      service: req.serviceName,
      dbName,
      collection,
      count: result.length,
      result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const updateData = async (req, res) => {
  try {
    const { dbName, collection, filter = {}, updateData: newData } = req.body;

    if (false/*!req.permissions?.update*/) {
      return res.status(403).json({
        success: false,
        error: "Update permission denied"
      });
    }

    if (!isValidDbName(dbName)) {
      return res.status(400).json({
        success: false,
        error: "Invalid dbName"
      });
    }

    if (!isValidCollectionName(collection)) {
      return res.status(400).json({
        success: false,
        error: "Invalid collection name"
      });
    }

    if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
      return res.status(400).json({
        success: false,
        error: "filter must be an object"
      });
    }

    if (!newData || typeof newData !== "object" || Array.isArray(newData)) {
      return res.status(400).json({
        success: false,
        error: "updateData must be an object"
      });
    }

    const result = await update({
      dbName,
      collection,
      filter,
      updateData: newData
    });

    return res.status(200).json({
      success: true,
      service: req.serviceName,
      dbName,
      collection,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const deleteData = async (req, res) => {
  try {
    const { dbName, collection, filter = {} } = req.body;

    if (false /*!req.permissions?.delete*/) {
      return res.status(403).json({
        success: false,
        error: "Delete permission denied"
      });
    }

    if (!isValidDbName(dbName)) {
      return res.status(400).json({
        success: false,
        error: "Invalid dbName"
      });
    }

    if (!isValidCollectionName(collection)) {
      return res.status(400).json({
        success: false,
        error: "Invalid collection name"
      });
    }

    if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
      return res.status(400).json({
        success: false,
        error: "filter must be an object"
      });
    }

    const result = await remove({
      dbName,
      collection,
      filter
    });

    return res.status(200).json({
      success: true,
      service: req.serviceName,
      dbName,
      collection,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
