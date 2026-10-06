import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const associations = await import("../models/modelAssociations.js");
const { CalendarTask } = associations;
const { default: Notification } = await import("../models/Notification.js");
const { default: Preference } = await import("../models/Preference.js");
const { default: CourseFeedback } = await import("../models/CourseFeedback.js");
const { default: Course } = await import("../models/Course.js");
const calendar = await import("../controllers/CalendarTaskController.js");
const notifications = await import("../controllers/notificationController.js");
const preferences = await import("../controllers/preferenceController.js");
const feedback = await import("../controllers/feedbackController.js");
const { createCalendarTaskSchema, updateCalendarTaskSchema } = await import("../schemas/CalendarTaskSchema.js");
const { createPostSchema, reportContentSchema } = await import("../schemas/communitySchema.js");

const originals = {
  taskFindAll: CalendarTask.findAll, taskCreate: CalendarTask.create, taskFindOne: CalendarTask.findOne,
  notificationCount: Notification.count, notificationFindAll: Notification.findAll, notificationFindOne: Notification.findOne,
  notificationUpdate: Notification.update, notificationDestroy: Notification.destroy, notificationCreate: Notification.create,
  preferenceFindOne: Preference.findOne, preferenceCreate: Preference.create,
  feedbackFindOrCreate: CourseFeedback.findOrCreate, feedbackFindAll: CourseFeedback.findAll, feedbackFindOne: CourseFeedback.findOne,
  courseUpdate: Course.update,
};

const response = () => {
  const state = { statusCode: 200, body: undefined };
  return { state, res: { status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; return this; } } };
};

beforeEach(() => {
  CalendarTask.findAll = async () => []; CalendarTask.create = async (data) => data; CalendarTask.findOne = async () => null;
  Notification.count = async () => 0; Notification.findAll = async () => []; Notification.findOne = async () => null;
  Notification.update = async () => [0]; Notification.destroy = async () => 0; Notification.create = async (data) => data;
  Preference.findOne = async () => null; Preference.create = async (data) => data;
  CourseFeedback.findOrCreate = async () => { throw new Error("unexpected feedback create"); };
  CourseFeedback.findAll = async () => [{ avgRating: "0", totalReviews: "0" }]; CourseFeedback.findOne = async () => null;
  Course.update = async () => [1];
});

after(() => {
  CalendarTask.findAll=originals.taskFindAll; CalendarTask.create=originals.taskCreate; CalendarTask.findOne=originals.taskFindOne;
  Notification.count=originals.notificationCount; Notification.findAll=originals.notificationFindAll; Notification.findOne=originals.notificationFindOne;
  Notification.update=originals.notificationUpdate; Notification.destroy=originals.notificationDestroy; Notification.create=originals.notificationCreate;
  Preference.findOne=originals.preferenceFindOne; Preference.create=originals.preferenceCreate;
  CourseFeedback.findOrCreate=originals.feedbackFindOrCreate; CourseFeedback.findAll=originals.feedbackFindAll; CourseFeedback.findOne=originals.feedbackFindOne;
  Course.update=originals.courseUpdate;
});

test("calendar and community schemas enforce required domain rules", () => {
  assert.equal(createCalendarTaskSchema.safeParse({ date: "2026-10-05", text: "Study" }).success, true);
  assert.equal(createCalendarTaskSchema.safeParse({ date: "05-10-2026", text: "" }).success, false);
  assert.equal(updateCalendarTaskSchema.safeParse({ status: "Invalid" }).success, false);
  assert.equal(createPostSchema.safeParse({ type: "course", content: "Question" }).success, false);
  assert.equal(createPostSchema.safeParse({ type: "global", category: "General", content: "Hello" }).success, true);
  assert.equal(reportContentSchema.safeParse({ reason: "" }).success, false);
});

test("calendar tasks are always scoped to the authenticated user", async () => {
  let listOptions; CalendarTask.findAll = async (options) => { listOptions=options; return [{ id: 1 }]; };
  let outcome=response(); await calendar.getCalendarTasks({ user: { id: "user-1" } }, outcome.res);
  assert.deepEqual(listOptions.where, { userId: "user-1" });
  let created; CalendarTask.create=async(data)=>{created=data;return data;};
  outcome=response(); await calendar.createCalendarTask({user:{id:"user-1"},body:{date:"2026-10-05",text:"Study"}},outcome.res);
  assert.equal(outcome.state.statusCode,201); assert.deepEqual(created,{userId:"user-1",date:"2026-10-05",text:"Study",status:"Upcoming"});
  let findOptions; CalendarTask.findOne=async(options)=>{findOptions=options;return null;};
  outcome=response(); await calendar.deleteCalendarTask({user:{id:"user-1"},params:{id:"task-2"}},outcome.res);
  assert.deepEqual(findOptions.where,{id:"task-2",userId:"user-1"}); assert.equal(outcome.state.statusCode,404);
});

test("calendar update changes only supplied fields", async () => {
  let saves=0; const task={text:"Old",status:"Upcoming",async save(){saves+=1;}}; CalendarTask.findOne=async()=>task;
  const {state,res}=response(); await calendar.updateCalendarTask({user:{id:"u"},params:{id:"t"},body:{status:"Completed"}},res);
  assert.equal(state.statusCode,200); assert.equal(task.text,"Old"); assert.equal(task.status,"Completed"); assert.equal(saves,1);
});

test("notification reads and mutations are scoped to the authenticated user", async () => {
  let countWhere; Notification.count=async({where})=>{countWhere=where;return 3;};
  let outcome=response(); await notifications.getUnreadCount({user:{id:"u1"}},outcome.res); assert.deepEqual(countWhere,{userId:"u1",unread:true}); assert.deepEqual(outcome.state.body,{count:3});
  let readWhere; const note={unread:true,async save(){}}; Notification.findOne=async({where})=>{readWhere=where;return note;};
  outcome=response(); await notifications.markAsRead({user:{id:"u1"},params:{id:"n1"}},outcome.res); assert.deepEqual(readWhere,{id:"n1",userId:"u1"}); assert.equal(note.unread,false);
  let clearWhere; Notification.destroy=async({where})=>{clearWhere=where;return 2;};
  outcome=response(); await notifications.clearAll({user:{id:"u1"}},outcome.res); assert.deepEqual(clearWhere,{userId:"u1"});
});

test("notification utility returns null rather than throwing when persistence fails", async () => {
  Notification.create=async()=>{throw new Error("db offline");}; const original=console.error; console.error=()=>{};
  try { assert.equal(await notifications.createNotification("u",{title:"T",message:"M",type:"system"}),null); } finally { console.error=original; }
});

test("preferences reject duplicates and incomplete requests", async () => {
  Preference.findOne=async()=>({id:"existing"}); let outcome=response(); await preferences.createPreferences({user:{id:"u"},body:{}},outcome.res); assert.equal(outcome.state.statusCode,400);
  Preference.findOne=async()=>null; outcome=response(); await preferences.createPreferences({user:{id:"u"},body:{explanation_type:"visual"}},outcome.res); assert.equal(outcome.state.statusCode,400);
});

test("preferences create and update complete user-scoped records", async () => {
  const body={explanation_type:"visual",learning_style:"practice",teaching_pace:"steady",example_type:"real",focus_area:"backend"};
  let created; Preference.create=async(data)=>{created=data;return data;}; let outcome=response(); await preferences.createPreferences({user:{id:"u"},body},outcome.res); assert.equal(outcome.state.statusCode,201); assert.equal(created.user_id,"u");
  let saves=0; const record={async save(){saves+=1;}}; Preference.findOne=async()=>record; outcome=response(); await preferences.updatePreferences({user:{id:"u"},body},outcome.res); assert.equal(saves,1); assert.equal(record.focus_area,"backend");
});

test("feedback rejects invalid ratings and non-enrolled users", async () => {
  let outcome=response(); await feedback.submitFeedback({params:{courseId:"7"},body:{rating:0},user:{id:"u",purchasedCourses:[]}},outcome.res); assert.equal(outcome.state.statusCode,400);
  outcome=response(); await feedback.submitFeedback({params:{courseId:"7"},body:{rating:5},user:{id:"u",purchasedCourses:[]}},outcome.res); assert.equal(outcome.state.statusCode,403);
});

test("feedback creates an enrolled review and recomputes the course rating", async () => {
  const record={id:1,rating:5,review:"Great",userName:"User",userAvatar:null,createdAt:"now",updatedAt:"now"};
  let findArgs; CourseFeedback.findOrCreate=async(args)=>{findArgs=args;return [record,true];}; CourseFeedback.findAll=async()=>[{avgRating:"4.5",totalReviews:"2"}];
  let courseUpdate; Course.update=async(...args)=>{courseUpdate=args;return[1];}; const {state,res}=response();
  await feedback.submitFeedback({params:{courseId:"7"},body:{rating:5,review:" Great "},user:{id:"u",name:"User",purchasedCourses:[{courseId:7}]}},res);
  assert.equal(state.statusCode,201); assert.deepEqual(findArgs.where,{courseId:7,userId:"u"}); assert.equal(findArgs.defaults.review,"Great"); assert.deepEqual(courseUpdate,[{rating:4.5},{where:{id:7}}]); assert.equal(state.body.totalReviews,2);
});

test("feedback deletion is owner-scoped and recomputes rating", async () => {
  let outcome=response(); await feedback.deleteFeedback({params:{courseId:"7"},user:{id:"u"}},outcome.res); assert.equal(outcome.state.statusCode,404);
  let destroyed=0; CourseFeedback.findOne=async()=>({async destroy(){destroyed+=1;}}); CourseFeedback.findAll=async()=>[{avgRating:"3",totalReviews:"1"}];
  outcome=response(); await feedback.deleteFeedback({params:{courseId:"7"},user:{id:"u"}},outcome.res); assert.equal(destroyed,1); assert.deepEqual(outcome.state.body,{message:"Review deleted",avgRating:"3.0",totalReviews:1});
});
