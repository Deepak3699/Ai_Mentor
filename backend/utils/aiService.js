function getAiServiceHeaders(baseHeaders = {}) {
  const serviceKey = process.env.AI_SERVICE_API_KEY?.trim();

  if (!serviceKey) {
    return { ...baseHeaders };
  }

  return {
    ...baseHeaders,
    'x-service-key': serviceKey,
  };
}

export{
  getAiServiceHeaders,
};