define([
    'bean',
    'bonzo',
    'fastdom',
    'Promise',
    'lodash/functions/debounce',
    'lib/config',
    'lib/cookies',
    'lib/storage',
    'lib/mediator',
    'lib/fastdom-promise',
    'lib/private-browsing',
    'raw-loader!common/views/experiments/tailor-survey.html',
    'lib/fetch-json',
    'lodash/collections/forEach'
], function (bean,
             bonzo,
             fastdom,
             Promise,
             debounce,
             config,
             cookies,
             storage,
             mediator,
             fastdomPromise,
             privateBrowsing,
             quickSurvey,
             fetchJson,
             forEach) {
    return function () {
        this.id = 'TailorSurvey';
        this.start = '2017-01-25';
        this.expiry = '2017-03-31';
        this.author = 'Manlio & Mahana';
        this.description = 'Testing Tailor surveys';
        this.audience = 0.01;
        this.audienceOffset = 0.7;
        this.successMeasure = 'We can show a survey on Frontend as decided by Tailor';
        this.audienceCriteria = 'All users';
        this.dataLinkNames = 'Tailor survey';
        this.idealOutcome = '';

        this.canRun = function () {
            return !(config.page.isAdvertisementFeature) &&
                config.page.contentType === 'Article'
        };

        function callTailor(bwid, surveysNotShowAgain) {
            var endpoint = 'https://tailor.guardianapis.com/suggestions?browserId=' + bwid + '&edition=' + config.page.edition + '&alwaysShowSurvey=true' + '&surveysNotToShow=' + surveysNotShowAgain;
            console.log(endpoint);
            return fetchJson(endpoint, {
                type: 'json',
                method: 'get'
            });
        }

        function storeSurveyShowedInCookie(surveySuggestionToShow) {
            var id = surveySuggestionToShow.data.survey.surveyId;
            var dayCanShowAgain = surveySuggestionToShow.data.dayCanShowAgain;

            var newCookieValue = id + '=' + dayCanShowAgain;

            var currentCookieValues = cookies.get('GU_TAILOR_SURVEY');

            if (currentCookieValues) {
                // we've shown surveys already
                currentCookieValues = currentCookieValues + ',' + newCookieValue;
                cookies.remove('GU_TAILOR_SURVEY');
                cookies.add('GU_TAILOR_SURVEY', currentCookieValues, 365);
            }
            else {
                // first time we show any survey
                cookies.add('GU_TAILOR_SURVEY', newCookieValue, 365);
            }
        }

        function getSurveySuggestionToShow(response) {
            if (response.suggestions) {

                var surveySuggestions = response.suggestions.filter(function (suggestion) {
                    return suggestion.class == 'SurveySuggestion';
                });

                if (surveySuggestions) {
                    return surveySuggestions[0];
                }
            }
        }

        function getSurveyIdsNotToShow() {
            var currentCookieValues = cookies.get('GU_TAILOR_SURVEY');

            var values = currentCookieValues ? currentCookieValues.split(',') : [];

            var isAfterToday = function (cookieValue) {
                var date = cookieValue.split('=')[1];
                return new Date(date).valueOf() > new Date().valueOf();
            };

            var surveysWeCannotShow = values.filter(isAfterToday);

            var ids = surveysWeCannotShow.map(function (idAndDate) {
                return idAndDate.split('=')[0]
            }).toString();

            return ids;
        }

        function renderQuickSurvey() {
            var bwid = cookies.get('bwid');

            var ids = getSurveyIdsNotToShow();

            if (bwid) {
                return callTailor(bwid, ids).then(function (response) {
                    console.log(response);

                    var surveySuggestionToShow = getSurveySuggestionToShow(response);

                    storeSurveyShowedInCookie(surveySuggestionToShow);

                    // renders the survey
                    return fastdomPromise.write(function () {
                        var article = document.getElementsByClassName('content__article-body')[0];
                        var insertionPoint = article.getElementsByTagName('p')[1];
                        var surveyDiv = document.createElement('div');
                        surveyDiv.innerHTML = quickSurvey;
                        article.insertBefore(surveyDiv, insertionPoint);
                    });
                });
            }
        }

        function disableRadioButtons(buttonClassName) {
            var radioButtons = document.getElementsByClassName(buttonClassName);
            bonzo(radioButtons).each(function (button) {
                button.disabled = true;
            });
        }

        function surveyFadeOut() {
            var surveyContent = document.getElementsByClassName('impressions-survey__content');
            surveyContent[0].classList.add('js-impressions-survey__fadeout');
        }

        function thankyouFadeIn() {
            var surveyThanks = document.getElementsByClassName('impressions-survey__thanks');
            surveyThanks[0].classList.add('js-impressions-survey__fadein');
        }

        function handleSurveyResponse() {
            var surveyQuestions = document.getElementsByClassName('fi-survey__button');

            forEach(surveyQuestions, function (question) {
                    bean.on(question, 'click', function (event) {
                        if (event.target.attributes.getNamedItem("data-link-name")) {
                            var answer = event.target.attributes.getNamedItem("data-link-name").value;
                            recordOphanAbEvent(answer);

                            mediator.emit('tailor:survey:clicked');
                            fastdom.write(function () {
                                disableRadioButtons('fi-survey__button');
                                surveyFadeOut();
                                thankyouFadeIn();
                            });
                        }
                    });
                }
            );
        }

        function recordOphanAbEvent(answer) {
            require(['ophan/ng'], function (ophan) {
                ophan.record({
                    component: 'tailor-survey',
                    value: answer
                });
            });
        }

        this.variants = [
            {
                id: 'control',
                test: function () {
                    console.log("control here ciao blabla")
                }
            },
            {
                id: 'variant',
                test: function () {
                    cookies.add("bwid", "KhaK6MqWrTTNyPkt8dVyf1SA", 365)
                    console.log('variant!');
                    Promise.all([renderQuickSurvey(), privateBrowsing]).then(function () {
                        mediator.emit('survey-added');
                        handleSurveyResponse();
                    });
                },
                impression: function (track) {
                    mediator.on('survey-added', track);
                },
                success: function (complete) {
                    mediator.on('tailor:survey:clicked', complete);
                }
            }
        ];
    };
});
