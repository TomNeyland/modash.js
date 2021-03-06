## 0.7.0 (2015-08-28)


#### Features

* **aggregation:** Adds complete $match operator ([7827882f](https://github.com/TomNeyland/modash.js/commit/7827882f959ac1500d736ab49412cf343f97e7dd))
* **operators:** Adds string operators ([a079adf7](https://github.com/TomNeyland/modash.js/commit/a079adf7f9ac6a8d240782037f49da73d53ce63f))


### 0.6.1 (2015-08-18)


#### Features

* **aggregation:** Adds initial $match and $limit implementation ([9bae5baf](https://github.com/TomNeyland/modash.js/commit/9bae5baf957ad3ab38bf06dff1a72f03f9d21415))
* **gulp:** Add gh-pages task ([dddbbe71](https://github.com/TomNeyland/modash.js/commit/dddbbe710722b148e6b85f1f5453581d8fdcd474))


## 0.6.0 (2015-08-16)


#### Bug Fixes

* **tests:** Adds explicit import for expect ([2161b68f](https://github.com/TomNeyland/modash.js/commit/2161b68f15f013c32263bf3662eedd308eccf327))


#### Features

* Adds $group and $project functions ([935a3a83](https://github.com/TomNeyland/modash.js/commit/935a3a83739e0936bce691a6888d321c6d51b8ac))
* **accumulators:** Adds Accumulator Operators for $group ([08f29fe2](https://github.com/TomNeyland/modash.js/commit/08f29fe2b0b01e87ad55c8f1e79b36cc275fdd94))
* **aggregation:** Adds support for $group expressions ([ba861880](https://github.com/TomNeyland/modash.js/commit/ba861880221fc01b850bdcb3a429da29c4b908a5))
* **operators:**
  * Adds more Date Operators ([45a29049](https://github.com/TomNeyland/modash.js/commit/45a29049d9b5d5d3c31e84e528a548d46481d74c))
  * Adds Date Operators ([cc21aed3](https://github.com/TomNeyland/modash.js/commit/cc21aed3bef2d73b0e1223cddd033a1b98638d0d))
* **tests:**
  * Adds new spec reporter to karma ([33ea66d8](https://github.com/TomNeyland/modash.js/commit/33ea66d8df7c6b99ce2fd2474bb1bdda0cf3bb6f))
  * Adds more test datasets ([0bff391e](https://github.com/TomNeyland/modash.js/commit/0bff391eea4c4672aa2f8f6f7298f4887404f5e0))


## 0.5.0 (2015-07-21)


#### Bug Fixes

* **expressions:** Fixes isExpressionObject edge case ([8b130793](https://github.com/TomNeyland/modash.js/commit/8b130793a185cfd16fc1b971a0b05135838d2cf9))
* **tests:** Remove debug logging statements ([dbe91409](https://github.com/TomNeyland/modash.js/commit/dbe91409623991f99b2b9bc584bb6d670003688c))


#### Features

* **operators:** Adds Arithmetic Operators ([9edced6a](https://github.com/TomNeyland/modash.js/commit/9edced6af87e6f0ee9fce58e1125e003c9ec5df7))
* **tests:** Adds more test datasets ([37ee2d29](https://github.com/TomNeyland/modash.js/commit/37ee2d29c12c25e240b0094a6e9fdd0b1db03ca5))


### 0.4.3 (2015-07-21)


#### Bug Fixes

* **operators:** Fixes $eq missing from module export ([ee20c88e](https://github.com/TomNeyland/modash.js/commit/ee20c88e2c3497d57c07ddc60d7c9ccba38c6ccb))


### 0.4.2 (2015-07-21)


#### Bug Fixes

* **operators:** Error handling and spacing fixes ([c324d9f6](https://github.com/TomNeyland/modash.js/commit/c324d9f646259ae8afcdf38b4d464ed6b87ffd06))


#### Features

* **tests:** Adds survey test dataset ([921b4198](https://github.com/TomNeyland/modash.js/commit/921b4198bd283e367984f63fb599708a4ed43245))


### 0.4.1 (2015-07-21)


#### Bug Fixes

* **operators:**
  * Removes all extra logging ([42068ed4](https://github.com/TomNeyland/modash.js/commit/42068ed4a595731bff2fd088597388a0bf5ec197))
  * Removes stray debug log call ([a2e55997](https://github.com/TomNeyland/modash.js/commit/a2e55997ebe1d4c9d5709c9d21fbef8d98f4222c))


## 0.4.0 (2015-07-21)


#### Bug Fixes

* **expressions:** Fixes isExpressionOperator check ([9b3c17be](https://github.com/TomNeyland/modash.js/commit/9b3c17bea0f2b706ddc88570d078a3e38ed9222f))
* **operators:**
  * Remove debugging function ([3bbfa474](https://github.com/TomNeyland/modash.js/commit/3bbfa474d0fe754e71692337876c963136f828ac))
  * Fixes the behavior of set operators ([829683c3](https://github.com/TomNeyland/modash.js/commit/829683c3eaa9e11796b1715f1df3eab861224cc8))
  * Fixes $setEquals behavior ([fb12ab29](https://github.com/TomNeyland/modash.js/commit/fb12ab291ce794c6d484e107d50419cd9c3eab41))
  * Fixes naming typo ([566a2005](https://github.com/TomNeyland/modash.js/commit/566a20054c6eeeba6bcd815a63dbd7a39c68d02c))


#### Features

* **expressions:** Adds initial expression operator support Adds only the substr operator ([1e9611d8](https://github.com/TomNeyland/modash.js/commit/1e9611d88e781c997fffc802713810d8072028c1))
* **operators:**
  * Adds comparison operators ([916db102](https://github.com/TomNeyland/modash.js/commit/916db102d4d34cfa53202e45771445f2d8098387))
  * Adds set operators ([c0f9c7c5](https://github.com/TomNeyland/modash.js/commit/c0f9c7c5155e5ac8e3a8865365af685fc1d18a81))
  * Adds Boolean Operators ([bf271ab4](https://github.com/TomNeyland/modash.js/commit/bf271ab46cc9a50b36615085ac52c4af4c215c85))
* **test:**
  * Adds more test collections ([442d9c31](https://github.com/TomNeyland/modash.js/commit/442d9c31d554acc2f69ccfd468336d8ef497621c))
  * Adds more test collections ([b0d4d60e](https://github.com/TomNeyland/modash.js/commit/b0d4d60e39a625d5ab173aca15b717dd50d270ff))


### 0.3.2 (2015-07-20)


#### Bug Fixes

* **package:** Fixes version conflicts ([f89d08a0](https://github.com/TomNeyland/modash.js/commit/f89d08a0bc992514cd17d0d4f12be5ee9a8e899a))


### 0.3.1 (2015-07-20)


#### Bug Fixes

* **lint:** Adds temporary eslint disables ([56c7c569](https://github.com/TomNeyland/modash.js/commit/56c7c569055fe3c6901dff533c985011a7c2a34d))


## 0.3.0 (2015-07-20)


#### Bug Fixes

* **test-data:** Fixed an error in the BOOKMARKS collection ([6f74ad0a](https://github.com/TomNeyland/modash.js/commit/6f74ad0a798b86aa33476e186b313b5bb98fec9c))


#### Features

* **aggregation:** Adds support for $project on embedded arrays ([5913c347](https://github.com/TomNeyland/modash.js/commit/5913c34749e4895214174e09ac5a2eab104f76cf))


## 0.2.0 (2015-07-17)


#### Bug Fixes

* **release:** Use lint task ([e4a79d63](https://github.com/TomNeyland/modash.js/commit/e4a79d63857b8e729ccc7a2030ce2c444d5f2a86))


#### Features

* **aggregation:** Adds WIP projection support ([759ca190](https://github.com/TomNeyland/modash.js/commit/759ca190b21d95924718e9967c37d6bd1d3b1bf8))


### 0.1.2 (2015-07-15)


#### Bug Fixes

* **gulp:** Fixes some build issues ([55c1045c](https://github.com/TomNeyland/modash.js/commit/55c1045cd8c3f22eee06c0ecb1c152e52a99f431))


### 0.1.1 (2015-07-15)


#### Bug Fixes

* **git:** Adds missing gitignore lines ([5ae2a217](https://github.com/TomNeyland/modash.js/commit/5ae2a2172aa5aa2995c74979ad686d5a3de3367d))


## 0.1.0 (2015-07-15)


#### Bug Fixes

* **package:** Point main to dist/modash.js ([3d3731f9](https://github.com/TomNeyland/modash.js/commit/3d3731f92e82e29f81f5dee498046f6b7cc8584d))


#### Features

* Adds TravisCI support ([f92a54c8](https://github.com/TomNeyland/modash.js/commit/f92a54c81fe550742b67e7d94c93d9294ff108f0))
* Adds tools and testing ([83c291a2](https://github.com/TomNeyland/modash.js/commit/83c291a291bf6032c9e876589303ee02f9526980))
* **readme:** Basic info and badge bling ([631bdf8e](https://github.com/TomNeyland/modash.js/commit/631bdf8e628dc641e1144901a6d1705315e7883f))


