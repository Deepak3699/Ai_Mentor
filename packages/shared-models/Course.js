export const defineCourse = (sequelize, DataTypes) => {
  return sequelize.define("Course", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: "Title is required" } },
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: "Category is required" } },
    },
    categoryColor: { type: DataTypes.STRING },
    lessons: { type: DataTypes.STRING },
    lessonsCount: { type: DataTypes.INTEGER },
    level: { type: DataTypes.STRING },
    price: { type: DataTypes.STRING },
    priceValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: { args: [0], msg: "Price value cannot be negative" } },
    },
    currency: { type: DataTypes.STRING, defaultValue: "INR" },
    rating: { type: DataTypes.FLOAT },
    students: { type: DataTypes.STRING },
    studentsCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    image: {
      type: DataTypes.STRING,
      comment: "Course thumbnail path. Example: /uploads/courses/react.png",
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "published",
      validate: { isIn: [["published", "disabled", "deleted"]] },
    },
  }, {
    timestamps: true,
    tableName: "Courses",
  });
};
