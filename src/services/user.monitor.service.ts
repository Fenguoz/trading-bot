import { UserMonitorSchema } from "../models/index";

export const UserMonitorService = {
  create: async (props: any) => {
    try {
      return await UserMonitorSchema.create(props);
    } catch (err: any) {
      console.log(err);
      throw new Error(err.message);
    }
  },
  findById: async (props: any) => {
    try {
      const { id } = props;
      const result = await UserMonitorSchema.findById(id);

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findOne: async (props: any) => {
    try {
      const filter = props;
      const result = await UserMonitorSchema.findOne({ ...filter });

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findLastOne: async (props: any) => {
    try {
      const filter = props;
      const result = await UserMonitorSchema.findOne(filter).sort({ updatedAt: -1 });

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  find: async (props: any) => {
    const filter = props;
    try {
      const result = await UserMonitorSchema.find(filter);

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findAndSort: async (props: any) => {
    const filter = props;
    try {
      const result = await UserMonitorSchema.find(filter).sort({ retired: 1, nonce: 1 })
        .exec();

      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  updateOne: async (props: any) => {
    const { id } = props;
    try {
      const result = await UserMonitorSchema.findByIdAndUpdate(id, props);
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  findAndUpdateOne: async (filter: any, props: any) => {
    try {
      const result = await UserMonitorSchema.findOneAndUpdate(filter, props);
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  updateMany: async (filter: any, props: any) => {
    try {
      const result = await UserMonitorSchema.updateMany(filter, {
        $set: props
      });
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },
  deleteOne: async (filter: any, props?: any) => {
    try {
      const result = await UserMonitorSchema.findOneAndDelete(filter);
      return result;
    } catch (err: any) {
      throw new Error(err.message);
    }
  },

};
