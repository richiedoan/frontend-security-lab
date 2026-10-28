
1. Request curl -i http://localhost:4000/public
Reponse:
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 77
ETag: W/"4d-KaxjfyoEeM/fyLn4My1reYAnEJM"
Date: Sat, 19 Sep 2026 08:57:29 GMT
Connection: keep-alive
Keep-Alive: timeout=5
{"message":"This is a public, local-only lab endpoint.","requestOrigin":null}

Return 200 because it's public endpoint


2. Request curl -i http://localhost:4000/private
Reponse:
HTTP/1.1 401 Unauthorized
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 83
ETag: W/"53-3ztNObs8xSvHLQFrQxLCBpx5eyY"
Date: Sat, 19 Sep 2026 08:57:50 GMT
Connection: keep-alive
Keep-Alive: timeout=5
{"message":"x-lab-user header is required","error":"Unauthorized","statusCode":401}

Return 401 service request header x-lab-user for this endpoint

3. Request curl -i -H 'x-lab-user: alice' http://localhost:4000/private
HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 40
ETag: W/"28-RZLOuDfq262BrTZB5H/hTIhjhX8"
Date: Sat, 19 Sep 2026 08:58:06 GMT
Connection: keep-alive
Keep-Alive: timeout=5
{"message":"Local lab user recognized."}

Return 200 because request attach header x-lab-user that follow the endpoint requirement


4. Origin của ba app là gì?
Web app       → http://localhost:3000
API           → http://localhost:4000
Attacker app  → http://localhost:3001

5. Vì sao form gây request nhưng attacker JS không đọc được response?
Vì gửi cross-origin request và đọc cross-origin reponse là hai quyền khác nhau.
Browser cho phép send simple cross-origin request => form có thể gửi request từ origin khác.

6. Vì sao curl vẫn gọi được API?
Vì SOP/CORS là browser security boundary.
Curl k cần browser để send request

7. 401 khác lỗi CORS ở đâu?
Khác nhau hoàn toàn về ai từ chối request.
401 => server từ chối
CORS => browser từ chối