require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
    // We use the 'v1beta' endpoint to see everything available to you
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY.trim()}`);
    const data = await response.json();
    
    console.log("--- YOUR AVAILABLE MODELS ---");
    if (data.models) {
      data.models.forEach(m => {
        console.log(`Model Name: ${m.name} | Methods: ${m.supportedGenerationMethods}`);
      });
    } else {
      console.log("No models found. Your API key is active but has NO models assigned.");
    }
  } catch (error) {
    console.error("List Error:", error.message);
  }
}

listModels();