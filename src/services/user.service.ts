import { UserSchema } from "../models/index";
import redisClient from "./redis";

export const UserService = {
  create: async (props: any) => {
    try {
      return await UserSchema.create(props);
    } catch (err: any) {
      console.log(err);
      throw new Error(err.message);
    }
  },
  findById: async (props: any) => {
    try {
      const { id } = props;
      const result = await UserSchema.findById(id);

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findOne: async (props: any) => {
    try {
      const filter = props;
      const result = await UserSchema.findOne({ ...filter, retired: false });

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findLastOne: async (props: any) => {
    try {
      const filter = props;
      const result = await UserSchema.findOne(filter).sort({ updatedAt: -1 });

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  find: async (props: any) => {
    const filter = props;
    try {
      const result = await UserSchema.find(filter);

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findAndSort: async (props: any) => {
    const filter = props;
    try {
      const result = await UserSchema.find(filter).sort({ retired: 1, nonce: 1 })
        .exec();

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  updateOne: async (props: any) => {
    const { id } = props;
    try {
      const result = await UserSchema.findByIdAndUpdate(id, props);
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findAndUpdateOne: async (filter: any, props: any) => {
    try {
      const result = await UserSchema.findOneAndUpdate(filter, props);
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  updateMany: async (filter: any, props: any) => {
    try {
      const result = await UserSchema.updateMany(filter, {
        $set: props
      });
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  deleteOne: async (props: any) => {
    try {
      const result = await UserSchema.findOneAndDelete({ props });
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  extractUniqueCode: (text: string): string | null => {
    const words = text.split(' ');
    return words.length > 1 ? words[1] : null;
  },

  extractPNLdata: (text: string): any => {
    const words = text.split(' ');
    if (words.length > 1) {
      if (words[1].endsWith('png')) {
        return words[1].replace('png', '.png');
      }
    }
  },
  setFrequency: async (chat_id: number, frequency: number) => {
    const key = `${chat_id}_frequency`;
    await redisClient.set(key, frequency);

    const result = await UserSchema.updateMany({ chat_id }, {
      $set: { frequency }
    });
    return result;
  },
  getFrequency: async (chat_id: number) => {
    const key = `${chat_id}_frequency`;
    const data = await redisClient.get(key);
    if (data) return parseInt(data);

    const result = await UserSchema.findOne({ chat_id });
    const frequency = result?.frequency ?? '4';
    redisClient.set(key, frequency);
    return parseInt(frequency);
  },
};
