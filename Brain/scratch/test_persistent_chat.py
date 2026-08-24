import requests
import json
import time

base_url = "http://127.0.0.1:8000"
test_email = "test_sidebar_student@example.com"
test_password = "studentpassword123"

# Create session
session = requests.Session()

print("--- 1. Silent Auth (Register and Login) ---")
reg_resp = session.post(f"{base_url}/auth/register", json={"email": test_email, "password": test_password})
print("Register Status:", reg_resp.status_code) # 201 or 400 if already exists

login_resp = session.post(f"{base_url}/auth/login", json={"email": test_email, "password": test_password})
print("Login Status:", login_resp.status_code)

print("\n--- 2. Create a New Conversation (Sidebar '+ New Chat') ---")
create_resp = session.post(f"{base_url}/conversations")
print("Create Conversation Status:", create_resp.status_code)
conv_data = create_resp.json()
print("Create Conversation Response:", json.dumps(conv_data, indent=2))
conv_id = conv_data.get("id")
print("Default Title is:", conv_data.get("title"))

print("\n--- 3. List Conversations (Sidebar Load) ---")
list_resp = session.get(f"{base_url}/conversations")
print("List Conversations Status:", list_resp.status_code)
convs = list_resp.json()
print(f"Total conversations in sidebar: {len(convs)}")
print("First conversation title in list is:", convs[0].get("title"))

print("\n--- 4. Send Message (Save message + generate AI + generate Title) ---")
msg_payload = {"content": "Photosynthesis is how plants make food."}
msg_resp = session.post(f"{base_url}/conversations/{conv_id}/messages", json=msg_payload)
print("Send Message Status:", msg_resp.status_code)
ai_msg_data = msg_resp.json()
print("AI Response:", ai_msg_data.get("content")[:150] + "...")

print("\n--- 5. Verify Conversation Title has dynamically changed ---")
list_resp2 = session.get(f"{base_url}/conversations")
convs2 = list_resp2.json()
target_conv = next((c for c in convs2 if c.get("id") == conv_id), None)
print("Updated Conversation Title in sidebar is now:", target_conv.get("title") if target_conv else "Not Found")

print("\n--- 6. Load Conversation Details (Verify Message History is Restored) ---")
detail_resp = session.get(f"{base_url}/conversations/{conv_id}")
print("Get Conversation Detail Status:", detail_resp.status_code)
detail_data = detail_resp.json()
print(f"Total messages in history: {len(detail_data.get('messages'))}")
for m in detail_data.get("messages"):
    print(f"  - [{m.get('role')}]: {m.get('content')[:50]}...")

print("\n--- 7. Delete Conversation ---")
del_resp = session.delete(f"{base_url}/conversations/{conv_id}")
print("Delete Conversation Status:", del_resp.status_code)
print("Delete Response:", del_resp.json())

print("\n--- 8. Verify Conversation is Removed ---")
list_resp3 = session.get(f"{base_url}/conversations")
convs3 = list_resp3.json()
target_conv_after = next((c for c in convs3 if c.get("id") == conv_id), None)
print("Conversation present in sidebar list after delete:", target_conv_after is not None)
