import mongoose from "mongoose";

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log("Mongo connected");
  } catch (error) {
    console.error("Mongo connection error:", error.message);
    process.exit(1);
  }
};
