import mongoose from "mongoose";

const getDB = (dbName) => {
  return mongoose.connection.useDb(dbName, { useCache: true });
};

export const create = async ({ dbName, collection, data }) => {
  const database = getDB(dbName);
  const dbCollection = database.collection(collection);

  return await dbCollection.insertOne(data);
};

export const read = async ({ dbName, collection, filter = {} }) => {
  const database = getDB(dbName);
  const dbCollection = database.collection(collection);
  if(filter._id)
      filter._id = new mongoose.Types.ObjectId(filter._id);
  console.log(filter);
  return await dbCollection.find(filter).toArray();
};

export const update = async ({ dbName, collection, filter = {}, updateData = {} }) => {
  const database = getDB(dbName);
  const dbCollection = database.collection(collection);
  const update = {}, setData = {...updateData}, unsetData = {};
  if(setData.photo == null || setData.photo == "") {
    delete setData.photo;
    unsetData.photo = "";
  }
  if(Object.keys(setData).length > 0) update.$set = setData;
  if(Object.keys(unsetData).length > 0) update.$unset = unsetData;
  if(Object.keys(update).length == 0) return {matchedCount: 0, modifiedCount: 0, message: "Nothing to update"};
  if(filter._id)
      filter._id = new mongoose.Types.ObjectId(filter._id);
  console.log(filter, update);
  return await dbCollection.updateMany(filter, update);
};

export const remove = async ({ dbName, collection, filter = {} }) => {
  const database = getDB(dbName);
  const dbCollection = database.collection(collection);
  if(filter._id)
      filter._id = new mongoose.Types.ObjectId(filter._id);
  return await dbCollection.deleteMany(filter);
};
