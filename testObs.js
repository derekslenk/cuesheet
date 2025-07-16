const { connectToOBS, getOBSClient, disconnectFromOBS } = require('./lib/obsClient');

async function testOBS() {
  try {
    await connectToOBS();
    console.log('OBS WebSocket connected successfully.');
    // Perform additional OBS calls here, if needed.
    const obs = getOBSClient();
    const { inputs } = await obs.call('GetInputList');
    console.log(inputs)
    const { inputSettings } = await obs.call('GetInputSettings', { inputName:'ss_left' });
    console.log('Source Switcher Settings:', inputSettings);
    // console.log(obs)
    await disconnectFromOBS();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testOBS();
