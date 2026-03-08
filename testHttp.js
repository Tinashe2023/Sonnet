async function testApi() {
    try {
        const response = await fetch('http://localhost:3004/messages/search?q=a&type=group&roomId=public');
        const data = await response.json();
        console.log("Returned messages count:", data.messages ? data.messages.length : 0);
        if (data.messages && data.messages.length > 0) {
            console.log("First message:", data.messages[0]);
        } else {
            console.log("Response:", data);
        }
    } catch (e) {
        console.error("Fetch error:", e.message);
    }
}
testApi();
