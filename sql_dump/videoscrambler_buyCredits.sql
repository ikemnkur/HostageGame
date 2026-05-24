-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: 34.57.139.74    Database: videoscrambler
-- ------------------------------------------------------
-- Server version	8.0.41-google

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'b1fb7176-d1f2-11f0-9251-42010a400002:1-3413';

--
-- Table structure for table `buyCredits`
--

DROP TABLE IF EXISTS `buyCredits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `buyCredits` (
  `id` varchar(10) NOT NULL DEFAULT '0',
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `phoneNumber` varchar(20) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `encryptionKey` varchar(100) DEFAULT NULL,
  `date` bigint DEFAULT NULL,
  `time` varchar(50) DEFAULT NULL,
  `currency` varchar(8) DEFAULT NULL,
  `amount` decimal(18,8) DEFAULT NULL,
  `walletAddress` varchar(100) DEFAULT NULL,
  `credits` int DEFAULT NULL,
  `status` enum('completed','processing','failed') DEFAULT 'processing',
  `transactionId` varchar(255) DEFAULT NULL,
  `transactionHash` varchar(255) DEFAULT NULL,
  `transactionScreenshot` varchar(255) DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `userAgent` varchar(255) DEFAULT NULL,
  `orderLoggingEnabled` tinyint(1) DEFAULT NULL,
  `session_id` varchar(255) DEFAULT NULL,
  `blockExplorerLink` varchar(255) DEFAULT NULL,
  `rate` decimal(10,3) DEFAULT NULL,
  `cryptoAmount` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `paymentMethod` varchar(255) DEFAULT NULL,
  `package` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `username` (`username`),
  CONSTRAINT `buyCredits_ibfk_1` FOREIGN KEY (`username`) REFERENCES `userData` (`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `buyCredits`
--

LOCK TABLES `buyCredits` WRITE;
/*!40000 ALTER TABLE `buyCredits` DISABLE KEYS */;
INSERT INTO `buyCredits` VALUES ('0k8dmndb','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765683665011,'2025-12-14T03:41:05.011Z','USD',1000.00000000,'Stripe',1000,'processing',NULL,'pi_3Se6ALEViYxfJNd20cGBDrgE',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'10',NULL,NULL,'10$ Package'),('4qoogba1','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765683055334,'2025-12-14T03:30:55.334Z','USD',500.00000000,'Stripe',500,'processing',NULL,'pi_3Se60HEViYxfJNd21399wIv6',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'5',NULL,NULL,'5$ Package'),('cvskyq1e','testman','testman@gmail.com','undefined undefined',NULL,NULL,NULL,1767375553370,'2026-01-02T17:39:13.370Z','USD',250.00000000,'Stripe',2500,'processing',NULL,'pi_3SlCIyEViYxfJNd209nTPjiv',NULL,'108.214.170.129','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0',0,'LCBGL8EJ7L','www.stripe.com',NULL,'2.5',NULL,'stripe','$2.50 Package'),('dn9c3ev4','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765683267809,'2025-12-14T03:34:27.809Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se64SEViYxfJNd21FrOy7un',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'20',NULL,NULL,'20$ Package'),('e57e3smm','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765675757708,'2025-12-14T01:29:17.708Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se46KEViYxfJNd20849fwtc',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'ZBD1124VF4','Stripe',NULL,NULL,NULL,NULL,NULL),('e7py4dfy','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1767382466012,'2026-01-02T19:34:26.012Z','USD',250.00000000,'Stripe',2500,'processing',NULL,'pi_3SlE6oEViYxfJNd20WiDfCUd',NULL,'108.214.170.129','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0',0,'ZBD1124VF4','www.stripe.com',NULL,'2.5',NULL,'stripe','$2.50 Package'),('f9xpszeu','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1766712543675,'2025-12-26T01:29:03.675Z','USD',500.00000000,'Stripe',500,'processing',NULL,'pi_3SiPp1EViYxfJNd202sXTV6B',NULL,'108.214.170.129','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0',0,'G0FOMQ7T7A','www.stripe.com',NULL,NULL,NULL,'stripe','5$ Package'),('hae1fc8f','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765675108474,'2025-12-14T01:18:28.474Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se3v2EViYxfJNd207JgXDNQ',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'customer_id: null','Stripe',NULL,NULL,NULL,NULL,NULL),('mnjcbbn6','testman','testman@gmail.com','undefined undefined',NULL,NULL,NULL,1766406869406,'2025-12-22T12:34:29.406Z','USD',250.00000000,'Stripe',250,'processing',NULL,'pi_3Sh8JUEViYxfJNd20J3URPIx',NULL,'108.214.170.129','Mozilla/5.0 (Android 15; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',0,'LCBGL8EJ7L','Stripe',NULL,'2.5',NULL,NULL,'2.5$ Package'),('pja39w5a','testman','testman@gmail.com',' ',NULL,NULL,NULL,1767427584961,'2026-01-03T08:06:24.961Z','USD',1250.00000000,'Bonus credits',1250,'processing',NULL,'pi_3SlPqUEViYxfJNd21hhRjbC4',NULL,'108.214.170.129','Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0',0,'LCBGL8EJ7L','www.stripe.com/sub',NULL,'2.5','2026-01-03 08:05:58','stripe','Basics subscription'),('to8aq037','ikemnkur','ikemnkur@gmail.com','undefined undefined',NULL,NULL,NULL,1765682794839,'2025-12-14T03:26:34.839Z','USD',250.00000000,'Stripe',250,'processing',NULL,'pi_3Se5ufEViYxfJNd20IXhwW2l',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'G0FOMQ7T7A','Stripe',NULL,'2.5',NULL,NULL,'2.5$ Package'),('uqg31525','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765675852645,'2025-12-14T01:30:52.645Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se48mEViYxfJNd20YvQk4jK',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'ZBD1124VF4','Stripe',NULL,NULL,NULL,NULL,NULL),('yvwvycfz','ikemuru','ikemuru@gmail.com','undefined undefined',NULL,NULL,NULL,1765676594999,'2025-12-14T01:43:14.999Z','USD',2000.00000000,'Stripe',2000,'processing',NULL,'pi_3Se4BqEViYxfJNd20sVZfFrB',NULL,'108.214.170.129','Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',0,'ZBD1124VF4','Stripe',NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `buyCredits` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-06 22:06:26
