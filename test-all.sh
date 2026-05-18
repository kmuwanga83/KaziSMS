#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              KAZISMS COMPLETE SYSTEM TEST                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

test_api() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=$4
    
    echo -n "Testing: $name ... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$url" -H "Content-Type: application/json" -d "$data" 2>/dev/null)
    else
        response=$(curl -s "$url" 2>/dev/null)
    fi
    
    # Check for success indicators
    if echo "$response" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q '"status":"healthy"'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q '"status":"received"'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q '"auto_replied"'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q '"data":'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q '"rules":'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    elif echo "$response" | grep -q '"name":"KaziSMS API"'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "Response: $response"
        ((FAILED++))
    fi
}

echo "1. CORE SYSTEM TESTS"
echo "────────────────────────────────────────────────────────"
test_api "Health Check" "http://localhost:3001/health"
test_api "API Info" "http://localhost:3001/"
test_api "Carrier Lookup (MTN)" "http://localhost:3001/v1/lookup/256775951662"

echo ""
echo "2. PAYMENT SYSTEM TESTS"
echo "────────────────────────────────────────────────────────"
test_api "Buy Credits" "http://localhost:3001/api/buy-credits" "POST" '{"phoneNumber":"256775951662","amount":5000}'
test_api "Check Balance" "http://localhost:3001/api/balance/256775951662"

echo ""
echo "3. SMS SENDING TESTS"
echo "────────────────────────────────────────────────────────"
test_api "Send SMS" "http://localhost:3001/v1/sms/send" "POST" '{"to":"256775951662","message":"Test message","from":"KaziSMS","phoneNumber":"256775951662"}'

echo ""
echo "4. TWO-WAY SMS TESTS"
echo "────────────────────────────────────────────────────────"
test_api "Simulate Incoming" "http://localhost:3001/api/test/incoming" "POST" '{"from":"256775951662","to":"KaziSMS","message":"Help"}'
test_api "Get Incoming Messages" "http://localhost:3001/v1/messages/incoming"
test_api "Configure Auto-Reply" "http://localhost:3001/v1/auto-reply/configure" "POST" '{"keyword":"help","response":"How can I help?","enabled":true}'
test_api "Get Auto-Reply Rules" "http://localhost:3001/v1/auto-reply/rules"

echo ""
echo "5. MESSAGE HISTORY TESTS"
echo "────────────────────────────────────────────────────────"
test_api "Get All Messages" "http://localhost:3001/v1/messages"
test_api "Get Statistics" "http://localhost:3001/v1/stats"

echo ""
echo "6. WEBHOOK TESTS"
echo "────────────────────────────────────────────────────────"
test_api "Webhook Receiver" "http://localhost:3001/api/sms-webhook" "POST" '{"event":"sms.received","data":{"from":"256775951662","message":"Test webhook"}}'

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "RESULTS: ${GREEN}$PASSED PASSED${NC} | ${RED}$FAILED FAILED${NC}"
echo "═══════════════════════════════════════════════════════════════"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! System is ready for deployment!${NC}"
else
    echo -e "${YELLOW}⚠️ $FAILED tests failed. Please check the errors above.${NC}"
fi
