const isURL = require("validator/lib/isURL");
const isInt = require("validator/lib/isInt");
const promise = require("bluebird");
const ObjectId = require("mongoose").Types.ObjectId;
const { Test } = require("../../../models/Test");
const { Question } = require("../../../models/Question");
const { Result } = require("../../../models/Result");

const getTests = async (req, res) => {
    const {
        query: { isClient },
        user,
    } = req;
    const query = isClient == true ? { isPublic: true } : {};

    try {
        const tests = await Test.find(query).populate("questions", "correctAnswer");
        const returnedResults = {};
        let results = [];

        if (user) {
            const idOfTests = tests.map((t) => t._id);
            results = await Result.find({ test: { $in: idOfTests } });
        }

        results.forEach((result, i) => {
            returnedResults[result._id] = result.transform();
        });
        tests.forEach((test, i) => {
            tests[i] = test.transform();
        });

        return res.status(200).json({ tests, results: returnedResults });
    } catch (error) {
        return res.status(500).json(error);
    }
};

const getTestById = async (req, res) => {
    const {
        params: { testId },
        query: { isClient },
        user,
    } = req;
    const query = isClient == true ? { isPublic: true, _id: testId } : { _id: testId };

    if (!ObjectId.isValid(testId + "")) return res.status(400).json({ error: "testId is invalid" });

    try {
        const test = await Test.findOne(query).populate("questions");
        const result = {};
        if (!test) return res.status(404).json({ error: "Test not found" });
        const questions = await Question.find().where("_id").in(test.questions).populate("word");
        test.questions = questions;

        if (user) {
            result = await Result.findOne({ user: user.id, test: test._id });
        }
        if (Object.keys(result).length == 0 && user) {
            result = new Result({ user: user.id, test: test._id });
            await result.save();
        }
        return res
            .status(200)
            .json({ test: test.transform(), result: Object.keys(result).length > 0 ? result.transform() : result });
    } catch (error) {
        return res.status(500).json(error);
    }
};

const createTest = async (req, res) => {
    const { title, description, image, questions } = req.body;
    const errors = {};

    if (title + "".length < 3) errors.title = "title is invalid";
    if (description + "".length < 3) errors.description = "description is invalid";
    if (image && !isURL(image + "")) errors.image = "image is not URL";
    if (Array.isArray(questions)) {
        questions.forEach((ques) => {
            if (!ques.text && !ques.word) {
                errors.questions = "question is required word or text";
            } else if (!Array.isArray(ques.answers)) {
                errors.questions = "answers is invalid";
            } else if (!isInt(ques.correctAnswer + "")) {
                errors.questions = "correctAnswer must be integer";
            }
        });
    } else {
        errors.questions = "questions is not array";
    }
    if (Object.keys(errors).length > 0) return res.status(400).json(errors);

    try {
        const questionsList = await promise.map(
            questions,
            function (ques) {
                const newQuestion = new Question(ques);
                return newQuestion.save();
            },
            { concurrency: 30 }
        );
        const newTest = new Test({
            questions: questionsList,
            title,
            description,
            image,
        });
        await newTest.save();

        return res.status(201).json(newTest.transform());
    } catch (error) {
        return res.status(500).json(error);
    }
};

const updateTest = async (req, res) => {
    const { testId } = req.params;
    const { title, description, image, questions } = req.body;
    const errors = {};

    if (title + "".length < 3) errors.title = "title is invalid";
    if (description + "".length < 3) errors.description = "description is invalid";
    if (image && !isURL(image + "")) errors.image = "image is not URL";
    if (Array.isArray(questions)) {
        const foundQuestions = await Question.find({ _id: { $in: questions } });
        if (foundQuestions.length != questions.length) errors.questions = "some questions cannot be found";
    } else {
        errors.questions = "questions is not array";
    }
    if (Object.keys(errors).length > 0) return res.status(400).json(errors);

    try {
        await Test.updateOne(
            { _id: testId },
            {
                questions,
                title,
                description,
                image,
            }
        );

        return res.status(200).json({ isSuccess: true });
    } catch (error) {
        return res.status(500).json(error);
    }
};

const updateIsPublicOfTest = async (req, res) => {
    const { testId } = req.params;
    const { isPublic } = req.body;

    if (!ObjectId.isValid(testId + "")) return res.status(400).json({ error: "testId is invalid" });
    if (typeof isPublic != "boolean") return res.status(400).json({ isPublic: "isPublic must be boolean" });

    try {
        await Test.updateOne({ _id: testId }, { isPublic });

        return res.status(200).json({ isSuccess: true });
    } catch (error) {
        return res.status(500).json(error);
    }
};

module.exports = { createTest, getTests, getTestById, updateTest, updateIsPublicOfTest };
