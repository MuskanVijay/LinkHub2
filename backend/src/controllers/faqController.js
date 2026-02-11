// controllers/faqController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getQuestions = async (req, res) => {
  try {
    const questions = await prisma.faqQuestion.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        replies: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
};

exports.createQuestion = async (req, res) => {
  try {
    const { question } = req.body;
    const userId = req.user.userId;
    
    const newQuestion = await prisma.faqQuestion.create({
      data: {
        question,
        userId
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        replies: true
      }
    });
    
    res.json(newQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
};

exports.createReply = async (req, res) => {
  try {
    const { reply } = req.body;
    const { questionId } = req.params;
    const userId = req.user.userId;
    
    const newReply = await prisma.faqReply.create({
      data: {
        reply,
        questionId: parseInt(questionId),
        userId
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    
    res.json(newReply);
  } catch (error) {
    console.error('Error creating reply:', error);
    res.status(500).json({ error: 'Failed to create reply' });
  }
};

exports.likeQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const updated = await prisma.faqQuestion.update({
      where: { id: parseInt(questionId) },
      data: { likes: { increment: 1 } }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to like question' });
  }
};
exports.deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user.userId;

    // First find the question to check ownership
    const question = await prisma.faqQuestion.findUnique({
      where: { id: parseInt(questionId) }
    });

    if (!question) return res.status(404).json({ error: "Not found" });
    
    // Only allow the owner (or an admin) to delete
    if (question.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await prisma.faqQuestion.delete({
      where: { id: parseInt(questionId) }
    });

    res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete" });
  }
};