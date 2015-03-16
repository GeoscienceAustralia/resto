/*
 * RESTo
 * 
 * RESTo - REstful Semantic search Tool for geOspatial 
 * 
 * Copyright 2013 Jérôme Gasperi <https://github.com/jjrom>
 * 
 * jerome[dot]gasperi[at]gmail[dot]com
 * 
 * 
 * This software is governed by the CeCILL-B license under French law and
 * abiding by the rules of distribution of free software.  You can  use,
 * modify and/ or redistribute the software under the terms of the CeCILL-B
 * license as circulated by CEA, CNRS and INRIA at the following URL
 * "http://www.cecill.info".
 *
 * As a counterpart to the access to the source code and  rights to copy,
 * modify and redistribute granted by the license, users are provided only
 * with a limited warranty  and the software's author,  the holder of the
 * economic rights,  and the successive licensors  have only  limited
 * liability.
 *
 * In this respect, the user's attention is drawn to the risks associated
 * with loading,  using,  modifying and/or developing or reproducing the
 * software by the user in light of its specific status of free software,
 * that may mean  that it is complicated to manipulate,  and  that  also
 * therefore means  that it is reserved for developers  and  experienced
 * professionals having in-depth computer knowledge. Users are therefore
 * encouraged to load and test the software's suitability as regards their
 * requirements in conditions enabling the security of their systems and/or
 * data to be ensured and,  more generally, to use and operate it in the
 * same conditions as regards security.
 *
 * The fact that you are presently reading this means that you have had
 * knowledge of the CeCILL-B license and that you accept its terms.
 * 
 */
(function(window) {
   
     window.Resto = {  
        
        /*
         * Is ajax ready to do another request ?
         */
        ajaxReady: true,
        
        /*
         * infinite scrolling offset
         */
        offset: 0,
        
        /*
         * infinite scrolling limit
         */
        limit: 0,
        
        /*
         * Next page url for infiniteScroll
         */
        nextPageUrl: null,
        
        /*
         * Last state url
         */
        lastStateUrl:null,
        
        /*
         * Features array
         */
        features: {},
        
        /*
         * Initialize RESTo
         * 
         * @param {array} options
         * @param {Object} data
         */
        init: function(options, data) {

            var self = this;
            
            /*
             * Initialize variables
             */
            self.issuer = options.issuer;
            self.language = options.language || 'en';
            self.restoUrl = options.restoUrl || '';
            self.Util.translation = options.translation || {};
            self.Header.ssoServices = options.ssoServices || {};
            self.Header.userProfile = options.userProfile || {};
            
            /*
             * Set header
             */
            self.Header.init();
            
            /*
             * Set features
             */
            if (self.issuer && self.issuer === 'getResource' && data && data.features.length === 1) {
                self.features[data.features[0].id] = data.features[0];
            }
            
            /*
             * Show active panel and hide others
             */
            $('.resto-panel').each(function() {
                $(this).hasClass('active') ? $(this).show() : $(this).hide();
            });
            
            /*
             * Set trigger for panels
             */
            $('.resto-panel-trigger').click(function(e){
                e.preventDefault();
                e.stopPropagation();
                self.switchTo($(this).attr('href'));
            });
            
            /*
             * Side nav
             */
            $('#off-canvas-toggle').click(function(e){
                e.preventDefault();
                e.stopPropagation();
                if ($(this).hasClass('fa-chevron-right')) {
                    $(this).removeClass('fa-chevron-right').addClass('fa-chevron-left');
                }
                else {
                    $(this).removeClass('fa-chevron-left').addClass('fa-chevron-right');
                }
                $('.off-canvas-wrap').foundation('offcanvas', 'toggle', 'move-right');
            });
            
            /*
             * Update searchForm input
             */
            $("#resto-searchform").submit(function(e) {
                
                e.preventDefault();
                e.stopPropagation();
                
                /*
                 * Avoid multiple simultaneous ajax calls
                 */
                if (!self.ajaxReady) {
                    return false;
                }
                
                /*
                 * Reload page instead of update page
                 * (For home.php and collections.php pages) 
                 */
                if ($(this).attr('changeLocation')) {
                    self.ajaxReady = false;
                    window.Resto.Util.showMask();
                    window.location = $(this).attr('action') + '?q=' + $('#resto-searchform :input').val();
                    this.submit();
                    return true;
                }
                
                var serialized = '?', kvps = [];
                $('#resto-searchform :input').each(function(index) {
                    kvps[$(this).get(0).name] = $(this).val();
                });
                kvps = $.extend(self.Util.extractKVP(window.History.getState().cleanUrl), kvps);
                if (window.Resto.Map.isVisible()) {
                    kvps['box'] = window.Resto.Map.getExtent().join(',');
                }
                else {
                    delete kvps['box'];
                }
                
                /*
                 * Switch to list view if in metadata panel
                 */
                if (kvps['_view'] && (kvps['_view'] !== 'panel-list' || kvps['_view'] !== 'panel-map')) {
                    kvps['_view'] = 'panel-list';
                }
                
                /*
                 * Bound search to map extent in map view only !
                 */
                window.History.pushState({randomize: window.Math.random()}, null, Resto.Util.updateUrl(serialized, kvps));
            });
            
            /*
             * Force focus on search input form
             */
            if (!self.Util.isMobile()) {
                $('#search').focus();
            }
            
            /*
             * init(options) was called by getCollection
             */
            if (self.issuer && self.issuer === 'getCollection') {
                    
                if (data) {
                    self.updateFeaturesList(data, {
                        updateMap: false,
                        centerMap: true,
                        append:false
                    });
                }
                
                /*
                 * Bind history change with update collection action
                 */
                self.onHistoryChange(self.updateFeaturesList);
                
                /*
                 * Infinite scroll - in list view only !
                 */
                var lastScrollTop = 0;
                $(window).scroll(function() {
                    if (!self.nextPageUrl || !$('#panel-list').is(':visible')) {
                        return false;
                    }
                    var st = $(this).scrollTop();
                    if (st > lastScrollTop){
                        if($(window).scrollTop() + $(window).height() > $(document).height() - $('.footer').height() - 100 && self.ajaxReady) {
                            self.ajaxReady = false;
                            self.offset = self.offset + self.limit;
                            self.Util.showMask();
                            $.ajax({
                                type: "GET",
                                dataType: 'json',
                                url: self.nextPageUrl,
                                cache:false
                            }).done(function(data) {
                                self.unselectAll();
                                self.updateFeaturesList(data, {
                                    updateMap: true,
                                    centerMap: true,
                                    append:true
                                });
                            }).fail(function(jqXHR, textStatus) {
                                self.offset = self.offset - self.limit;
                                self.Util.dialog(Resto.Util.translate('_error'), textStatus);
                            }).always(function(){
                                self.ajaxReady = true;
                                self.Util.hideMask();
                            });
                        }
                    }
                    lastScrollTop = st;
                 });

                /*
                 * Change view
                 */
                var kvps = self.Util.extractKVP(window.History.getState().cleanUrl), panelId = kvps['_view'];
                if (panelId && panelId.substr(0, 5) !== 'panel' && self.features[panelId]) {
                    self.selectedId = panelId;
                    self.switchTo('panel-metadata');
                }
                else {
                    self.switchTo(panelId);
                }
            }
            
            self.Util.hideMask();

        },
        
        
        /**
         * Bind history state change
         * 
         * @param {function} callback // callback function to call on state change
         * 
         */
        onHistoryChange: function(callback) {
            
            var self = this;
            
            /*
             * State change - Ajax call to RESTo backend server
             */
            window.History.Adapter.bind(window, 'statechange', function() {
                
                var reload, kvps, lastKvps, state = window.History.getState();
                
                if (!self.lastStateUrl) {
                    self.lastStateUrl = state.cleanUrl;
                    reload = true;
                }
                else {
                    kvps = self.Util.extractKVP(state.cleanUrl);
                    lastKvps = self.Util.extractKVP(self.lastStateUrl);
                    for (var kvp in kvps) {
                        if (kvp === '_view') {
                            if (kvps[kvp].substr(0, 5) === 'panel') {
                                $('#panel-metadata-trigger').hide();
                            }
                            else {
                                $('#panel-metadata-trigger').show();
                            }
                            continue;
                        }
                        if (!lastKvps.hasOwnProperty(kvp) || kvps[kvp] !== lastKvps[kvp]) {
                            reload = true;
                        }
                    }
                    if (!reload) {
                        for (var kvp in lastKvps) {
                            if (kvp === '_view') {
                                continue;
                            }
                            if (!kvps.hasOwnProperty(kvp) || kvps[kvp] !== lastKvps[kvp]) {
                                reload = true;
                            }
                        }
                    }
                }
                
                /*
                 * Change view
                 */
                if (kvps && kvps['_view'] && kvps['_view'] !== self.currentView) {
                    $('.resto-panel').each(function() {
                        $(this).removeClass('active').hide();
                    });
                    $('.resto-panel-trigger').each(function() {
                        $(this).removeClass('active');
                    });
                    if (kvps['_view'].substr(0, 5) !== 'panel' && self.features[kvps['_view']]) {
                        self.selectedId = kvps['_view'];
                        $('#panel-metadata-trigger').addClass('active');
                        $('#panel-metadata').addClass('active').show();
                    }
                    else {
                        $('#' + kvps['_view'] + '-trigger').addClass('active');
                        $('#' + kvps['_view']).addClass('active').show();
                    }
                    self.currentView = kvps['_view'];
                    if (kvps['_view'] === 'panel-map') {
                        self.Map.init(self.Util.associativeToArray(self.features));
                    }
                }
                
                if (reload) {
                    self.Util.showMask();
                    self.unselectAll();
                    self.ajaxReady = false;
                    self.lastStateUrl = state.cleanUrl;
                    $.ajax({
                        url: self.Util.updateUrlFormat(state.cleanUrl, 'json'),
                        dataType: 'json',
                        cache:false
                    }).done(function(data) {
                        if (typeof callback === 'function') {
                            callback(data, {
                                updateMap:true,
                                centerMap:true
                            });
                        }
                    }).fail(function() {
                        self.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_connectionFailed'));
                    }).always(function(){
                        self.ajaxReady = true;
                        self.Util.hideMask();
                    });
                }
            });
            
        },
        
        /**
         * Switch view to input panel triggered by $trigger
         * 
         * @param {string} panelId
         */
        switchTo: function(panelId) {
            
            if (!panelId) {
                panelId = 'panel-list';
            }
            else if (panelId.substring(0, 1) === '#') {
                panelId = panelId.substring(1);
            }
            
            /*
             * Metadata special case
             */
            if (panelId === 'panel-metadata') {
                $('#panel-metadata-trigger').show();
                this.showMetadataPanel();
            }
            else {
                $('#panel-metadata-trigger').hide();
            }
            
            $('.resto-panel').each(function() {
                $(this).removeClass('active').hide();
            });
            $('.resto-panel-trigger').each(function() {
                $(this).removeClass('active');
            });
            
            $('#' + panelId + '-trigger').addClass('active');
            $('#' + panelId).addClass('active').show();
            
            var kvps = $.extend(this.Util.extractKVP(window.History.getState().cleanUrl), {'_view': panelId === 'panel-metadata' && this.selectedId ? this.selectedId : panelId})
            /*if (window.Resto.Map.isVisible()) {
                kvps['box'] = window.Resto.Map.getExtent().join(',');
            }
            else {
                delete kvps['box'];
            }*/
            window.History.pushState({
                randomize: window.Math.random()
            }, null, Resto.Util.updateUrl('?', kvps));

            /*
             * Map special case
             */
            if (panelId === 'panel-map') {
                this.Map.init(this.Util.associativeToArray(this.features));
            }
            
        },
        
        /**
         * Return textual resolution from value in meters
         * 
         * @param {integer} value
         */
        getResolution: function(value) {

            if (!$.isNumeric(value)) {
                return null;
            }

            if (value <= 2.5) {
                return 'THR';
            }

            if (value > 2.5 && value <= 30) {
                return 'HR';
            }

            if (value > 30 && value <= 500) {
                return 'MR';
            }

            return 'LR';

        },
        
        /**
         * Update facets list
         * 
         * @param {array} query
         * 
         * @returns {undefined}
         */
        updateFacets: function (query) {
            
            var i, key, where = [], when = [], what = [];
            query = query || {};
            
            /*
             * Update search input form
             */
            if ($('#search').length > 0) {
                $('#search').val(query ? query.original.searchTerms : '');
            }
            
            /*
             * Update query analysis result - TODO
             */
            if (query.analyzed) {
                for (key in query.analyzed) {
                    if (query.analyzed[key]) {
                        if (key === 'searchTerms') {
                            for (i = query.analyzed[key].length; i--;) {
                                var name = query.analyzed[key][i]['name'] || query.analyzed[key][i]['id'].split(':')[1];
                                if (query.analyzed[key][i]['type'] === 'continent' || query.analyzed[key][i]['type'] === 'country' || query.analyzed[key][i]['type'] === 'region' || query.analyzed[key][i]['type'] === 'state' || query.analyzed[key][i]['type'] === 'city') {
                                    where.push('<a href="#" class="resto-collection-info-trigger">' + name + '</a>');
                                }
                                else if (query.analyzed[key][i]['type'] === 'month') {
                                    when.push('<a href="#">' + name + '</a>');
                                }
                            }
                        }
                    }
                }
            }
            
            $('.facets_where').html(where.join('<br/>'));
            $('.facets_when').html(when.join('<br/>'));
            $('.facets_what').html(what.join('<br/>'));
           
        },
        
        /**
         * Update features list
         * 
         * @param {array} json
         * @param {boolean} options 
         *          {
         *              append: // true to append input features to existing features
         *              updateMap: // true to update map content
         *              centerMap: // true to center map on content
         *          }
         * 
         */
        updateFeaturesList: function(json, options) {

            var p, self = window.Resto;

            json = json || {};
            p = json.properties || {};
            options = options || {};
            
            /*
             * Update facets
             */
            self.updateFacets(p.query);
            
            /*
             * Update next page url (for infinite scroll)
             */
            self.nextPageUrl = null;
            if (p.links) {
                if ($.isArray(p.links)) {
                    for (var i = p.links.length; i--;) {
                        if (p.links[i]['rel'] === 'next') {
                            self.nextPageUrl = self.Util.updateUrlFormat(p.links[i]['href'], 'json');
                        }
                    }
                }
            }
            /*
             * Update result
             */
            var $container = $('.resto-features-container');
            if (!options.append) {
                $container = $container.empty();
                self.features = {};
            }
            self.updateGetCollectionResultEntries(json, $container);

            /*
             * Update map view
             */
            if (options.updateMap) {
                window.Resto.Map.updateLayer(self.Util.associativeToArray(json.features), {
                    'centerMap':options.centerMap,
                    'append':options.append
                });
            }
            
            if (!options.append && json.features.length === 0) {
                self.Util.dialog(self.Util.translate('_noSearchResultsTitle'), self.Util.translate('_noSearchResultsFor', [json.properties.query ? json.properties.query.original.searchTerms : '']));
            }
            
            /*
             * Click on ajaxified element call href url through Ajax
             */
            $('.resto-ajaxified').each(function() {
                $(this).click(function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.History.pushState({
                        randomize: window.Math.random(),
                        centerMap: false
                    }, null, self.Util.updateUrlFormat($(this).attr('href'), 'html'));
                    $('html, body').scrollTop(0);
                    return false;
                });
            });
            
        },

        /**
         * Update GetCollection result entries after a search
         * 
         * @param {array} json
         * @param {jQueryObject} $container
         */
        updateGetCollectionResultEntries: function(json, $container) {
            
            var i, ii, j, k, image, feature, $div, bottomInfos, topInfos, self = this;

            json = json || {};
            
            /*
             * Iterate on features and update result container
             */
            for (i = 0, ii = json.features.length; i < ii; i++) {

                bottomInfos = [];
                topInfos = [];
                feature = json.features[i];
                
                /*
                 * Update object features array 
                 */
                self.features[feature.id] = feature;
                
                /*
                 * Quicklook
                 */
                image = feature.properties['quicklook'] || feature.properties['thumbnail'] || self.restoUrl + '/css/default/img/noimage.png';

                /*
                 * Display structure
                 *  
                 *  <li>
                 *      <div id="...">
                 *          <div class="streched">
                 *              <div class="feature-info-top"></div>
                 *              <div class="feature-info-bottom"></div>
                 *              <div class="feature-info-left"></div>
                 *              <div class="feature-info-right"></div>
                 *          </div>
                 *      </div>
                 *  </li>
                 * 
                 */
                $container.append('<li style="position:relative;padding:0px;"><div id="' + feature.id + '" class="resto-feature"><div class="streched unselected"><div class="padded pin-top feature-info-top"></div><div class="padded pin-bottom pin-right feature-info-bottom link-light"></div><div class="padded pin-bottom pin-left feature-info-left"></div><div class="padded pin-top pin-right feature-info-right"></div></div></div></li>');
                $div = $('#' + feature.id).css({
                    'background': "url('" + image + "') no-repeat",
                    '-webkit-background-size': 'cover',
                    '-moz-background-size': 'cover',
                    '-o-background-size': 'cover',
                    'background-size': 'cover',
                    'height': '250px',
                    'box-sizing': 'border-box',
                    'padding': '0px'
                });
        
                /*
                 * $div.click(function(e) {
                 *      ($(this).children().first().hasClass('selected') ? self.unselectAll() : self.selectFeature($(this).attr('id'), false);
                 * });
                 */
                
                /*
                 * Feature infos (bottom)
                 */
                var keyword, typeAndId;
                if (feature.properties.keywords) {
                    for (j = feature.properties.keywords.length; j--;) {
                        keyword = feature.properties.keywords[j];
                        typeAndId = keyword.id.split(':');
                        if (typeAndId[0] === 'landuse') {
                            bottomInfos.push('<a href="' + self.Util.updateUrlFormat(keyword['href'], 'html') + '" class="landuse resto-ajaxified resto-keyword' + (typeAndId[0] ? ' resto-keyword-' + typeAndId[0].replace(' ', '') : '') + '" title="' + self.Util.translate('_thisResourceContainsLanduse', [Math.round(keyword.value), keyword.name]) + '"><img src="' + self.restoUrl + 'themes/default/img/landuse.white/' + typeAndId[1] + '.png"/></a> ');
                        }
                    }
                }
                $('.feature-info-bottom', $div).html(bottomInfos.join(''));
                
                /*
                 * Feature infos (top)
                 */
                topInfos.push('<h3 class="small date">' + self.Util.niceDate(feature.properties.startDate) + '</h3>');
                
                if (feature.properties.keywords) {
                    var hash, img = 'world', typeAndValue, best = -1, state = -1, region = -1, country = -1;
                    for (j = feature.properties.keywords.length; j--;) {
                        typeAndValue = feature.properties.keywords[j].id.split(':');
                        switch (typeAndValue[0]) {
                            case 'state':
                                state = j;
                                break;
                            case 'region':
                                if (feature.properties.keywords[j].id !== 'region:_all') {
                                    region = j;
                                }
                                break;
                            case 'country':
                                country = j;
                                break;
                        }
                    }
                    if (state !== -1) {
                        best = state;
                    }
                    else if (region !== -1) {
                        best = region;
                    }
                    else if (country !== -1) {
                        best = country;
                    }
                    if (best !== -1) {
                        hash = feature.properties.keywords[best]['hash'];
                        topInfos.push('<h2 class="small upper"><a href="' + feature.properties.keywords[best]['href'] + '" class="resto-ajaxified">' + feature.properties.keywords[best]['name'] + '</a></h2>');
                        var newHash, parentHash = feature.properties.keywords[best]['parentHash'];
                        while (parentHash) {
                            newHash = null;
                            for (k = feature.properties.keywords.length; k--;) {
                                if (feature.properties.keywords[k].hasOwnProperty('hash') && feature.properties.keywords[k]['hash'] === parentHash) {
                                    typeAndValue = feature.properties.keywords[k].id.split(':');
                                    if (feature.properties.keywords[k]['name'] !== 'region:_all' && typeAndValue[0] !== 'continent') {
                                        topInfos.push('<h4 class="small"><a href="' + feature.properties.keywords[k]['href'] + '" class="resto-ajaxified text-light hideOnUnselected">' + feature.properties.keywords[k]['name'] + '</a></h4>');
                                    }
                                    newHash = feature.properties.keywords[k]['parentHash'];
                                    hash = feature.properties.keywords[k]['hash'];
                                    try {
                                        img = feature.properties.keywords[k]['id'].split(':')[1].replace(' ', '');
                                    }
                                    catch (e) {
                                        img = 'world';
                                    }
                                    break;
                                }
                            }
                            parentHash = newHash;
                        }
                    }
                    $('.feature-info-right', $div).html('<a class="showOnMap" href="#" title="' + self.Util.translate('_showOnMap') + '"><img src="' + self.restoUrl + 'themes/default/img/world/' + img + '.png"/></a>');
                    
                    /*
                     * Actions
                     */
                    var actions = [];

                    actions.push('<a class="fa fa-2x fa-info viewMetadata hideOnUnselected text-dark" href="#" title="' + self.Util.translate('_viewMetadata') + '"></a>');

                    // Download feature
                    if (feature.properties['services'] && feature.properties['services']['download'] && feature.properties['services']['download']['url']) {
                        actions.push('<a class="fa fa-2x fa-cloud-download downloadProduct hideOnUnselected text-dark" href="' + feature.properties['services']['download']['url'] + '?lang=' + self.language + '" title="' + self.Util.translate('_download') + '"' + (feature.properties['services']['download']['mimeType'] === 'text/html' ? 'target="_blank"' : '') + '></a>');
                    }

                    // Add to cart
                    if (self.Header.userProfile.userid !== -1) {
                        actions.push('<a class="fa fa-2x fa-shopping-cart addToCart hideOnUnselected text-dark" href="#" title="' + self.Util.translate('_addToCart') + '"></a>');
                    }
                    $('.feature-info-left', $div).html('<div>' + actions.join('') + '</div>');
                    
                    (function($d, f) {
                        $('.showOnMap', $d).click(function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            self.switchTo('panel-map');
                            self.Map.select(f.id, true);
                            return false;
                        });
      
                        $('.viewMetadata', $d).click(function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            self.selectedId = f.id;
                            self.switchTo('panel-metadata');
                            return false;
                        });
                        $('.addToCart', $d).click(function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            self.addToCart(f);
                            return false;
                        });

                        $('.downloadProduct', $d).click(function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            if ($(this).attr('target') === '_blank') {
                                return true;
                            }
                            return self.download($(this).attr('href'));
                        });
                        
                    })($div, feature);
                    
                }
                $('.feature-info-top', $div).html(topInfos.join(''));
                
            }

        },
        
        /**
         * Select feature id
         * 
         * @param {string} id
         * @param {boolean} scroll : true to scroll page to the selected feature
         */
        selectFeature: function(id, scroll) {
            
            var $id = $('#' + id);
            
            this.unselectAll();
            
            /*
             * Switch to list view
             */
            this.switchTo('panel-list');
            $id.children().first().addClass('selected').removeClass('unselected');
            if (scroll) {
                $('html, body').scrollTop($id.offset().top);
            }
            
        },
        
        /**
         * Unselect all features
         */
        unselectAll: function() {
            $('.resto-feature').each(function () {
                $(this).children().first().removeClass('selected').addClass('unselected');
            });
        },
        
        /**
         * Display detailled feature info panel
         */
        showMetadataPanel:function() {
            
            var i, ii, key, typeAndId, types, content, self = this, $div = $('#panel-metadata'), feature;
            
            if (!self.selectedId || !self.features[self.selectedId]) {
                return false;
            }
            
            feature = self.features[self.selectedId];
            
            /*
             * Collection title and description
             */
            content = [];
            content.push('<div class="row fullWidth light"><div class="large-6 columns center text-dark padded-top"><h2>' + self.Util.translate('_resourceSummary', [feature['properties']['platform'], self.Util.niceDate(feature['properties']['startDate'])]) + '</h2>');
            content.push('<h7 title="' + self.selectedId + '" style="overflow: hidden;">' + self.selectedId + '</h7>');
            content.push('<p class="center padded-top">');
            
            /*
             * "Download" and "Add to cart" actions
             */
            if (feature['properties']['services'] && feature['properties']['services']['download'] && feature['properties']['services']['download']['url']) {
                content.push('<a class="fa fa-3x fa-cloud-download downloadProduct padded-right" href="' + feature.properties['services']['download']['url'] + '?lang=' + self.language + '" title="' + self.Util.translate('_download') + '"' + (feature.properties['services']['download']['mimeType'] === 'text/html' ? 'target="_blank"' : '') + '></a>');
            }
            if (self.Header.userProfile.userid !== -1) {
                content.push('<a class="fa fa-3x fa-shopping-cart addToCart padded-right" href="#" title="' + self.Util.translate('_addToCart') + '"></a>');
            }
            content.push('</p></div>');
            
            /*
             * TODO : Collection description
             */
            content.push('<div class="large-6 columns text-dark padded-top"></div></div>');
            
            /*
             * Quicklook and metadata
             */
            content.push('<div class="row resto-resource fullWidth light" style="padding-bottom:20px;"><div class="large-6 columns center"><img title="' + self.selectedId + '" class="resto-image" src="' + feature['properties']['quicklook'] + '"/></div>');
            content.push('<div class="large-6 columns"><table style="width:100%;"><table>');
            for (key in feature['properties']) {
                if ($.inArray(key, ['quicklook', 'thumbnail', 'links', 'services', 'keywords', 'updated', 'productId', 'landUse']) !== -1) {
                    continue;
                }
                if (typeof feature['properties'][key] !== "object") {
                    content.push('<tr><td>' + self.Util.translate(key) + '</td><td>' + feature['properties'][key] + '</td></tr>');
                }
            }
            content.push('</table></div></div>');
            
            /*
             * Location content
             */
            content.push('<div class="row resto-resource fullWidth dark"><div class="large-6 columns"><h1><span class="right">' + self.Util.translate('_location') + '</span></h1></div><div class="large-6 columns">');
            if (feature['properties']['keywords']) {
                types = ['continent', 'country', 'region', 'state'];
                for (key in types) {
                    for (i = 0, ii = feature['properties']['keywords'].length; i < ii; i++) {
                        typeAndId = feature['properties']['keywords'][i]['id'].split(':');
                        if (typeAndId[0].toLowerCase() === types[key] && feature['properties']['keywords'][i]['id'] !== 'region:_all') {
                            content.push('<h2><a title="' + self.Util.translate('_thisResourceIsLocated', feature['properties']['keywords'][i]['name']) + '" href="' + self.Util.updateUrlFormat(feature['properties']['keywords'][i]['href'], 'html') + '">' + feature['properties']['keywords'][i]['name'] + '</a></h2>');
                        }
                    }
                }
            }
            content.push('</div></div>');
            
            /*
             * Thematic content (Landcover)
             */
            content.push('<div class="row resto-resource fullWidth light"><div class="large-6 columns"><h1><span class="right">' + self.Util.translate('_landUse') + '</span></h1></div><div class="large-6 columns">');
            if (feature['properties']['keywords']) {
                for (i = 0, ii = feature['properties']['keywords'].length; i < ii; i++) {
                    typeAndId = feature['properties']['keywords'][i]['id'].split(':');
                    if (typeAndId[0].toLowerCase() === 'landuse') {
                        content.push('<h2>' + Math.round(feature['properties']['keywords'][i]['value']) + ' % <a title="' + self.Util.translate('_thisResourceContainsLanduse', feature['properties']['keywords'][i]['value'], feature['properties']['keywords'][i]['name']) + '" href="' + self.Util.updateUrlFormat(feature['properties']['keywords'][i]['href'], 'html') + '">' + feature['properties']['keywords'][i]['name'] + '</a></h2>');
                    }
                }
            }
            content.push('</div></div>');
            
            /*
             * Population count
             */
            
            $div.html(content.join(''));
            
            $('.addToCart', $div).click(function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.addToCart(feature);
                return false;
            });
            
            /*
        
        
        <!-- Population counter -->
        <?php if (isset($self->populationCounter)) { ?>
        <div class="row resto-resource fullWidth dark">
            <div class="large-6 columns">
                <h1 class="right"><?php echo $self->context->dictionary->translate('_estimatedPopulation'); ?></h1>
            </div>
            <div class="large-6 columns">
                <h2 class="text-light"><?php echo $self->context->dictionary->translate('_people', $self->populationCounter->count($product['geometry'])) ?></h2>
            </div>
        </div>
        <?php } ?>
        
        <!-- Wikipedia -->
        <?php if (isset($wikipediaEntries) && is_array($wikipediaEntries) && count($wikipediaEntries) > 0) { ?>
        <div class="row resto-resource fullWidth light">
            <div class="large-6 columns">
                <h1 class="right"><?php echo $self->context->dictionary->translate('_poi'); ?></h1>
            </div>
            <div class="large-6 columns">
                <?php foreach ($wikipediaEntries as $wikipediaEntry) { ?>
                <h2><a href="<?php echo $wikipediaEntry['url']; ?>"><?php echo $wikipediaEntry['title']; ?></a></h2>
                <p><?php echo $wikipediaEntry['summary']; ?></p>
                <?php } ?>
            </div>
        </div>
        <?php } ?>
        
             */
            
            
        },
        
        /**
         * Download product
         * 
         * @param {string} url
         * @returns {Boolean}
         */
        download: function(url) {
            var self = this;
            
            var $frame = $('#hiddenDownloader');
            if ($frame.length === 0) {
                $frame = $('<iframe id="hiddenDownloader" style="display:none;">').appendTo('body');
            }
            $frame.attr('src', url).load(function(){
                var error = {};
                try {
                    error = JSON.parse($('body', $(this).contents()).text());
                }
                catch(e) {}
                if (error['ErrorCode']) {
                    if (error['ErrorCode'] === 404) {
                        self.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_nonExistentResource'));
                    }
                    else if (error['ErrorCode'] === 3002) {
                        self.Header.signLicense(error['license'], error['collection'], url);
                    }
                    else if (error['ErrorCode'] === 403) {
                        self.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_unsufficientPrivileges'));
                    }
                }
            });
            return false;
        },
        
        /**
         * Add feature to cart
         * @param {Object} feature
         * @returns {undefined}
         */
        addToCart: function(feature) {
            
            var self = this;
            
            if (!feature) {
                self.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_nonExistentResource'));
                return false;
            }
     
            self.Util.showMask();
            $.ajax({
                url: self.restoUrl + 'users/' + self.Header.userProfile.userid + '/cart',
                type: 'POST',
                dataType: "json",
                data: JSON.stringify([
                    {
                        'id': feature.id,
                        'properties': {
                            'productIdentifier': feature.properties['productIdentifier'],
                            'productType': feature.properties['productType'],
                            'quicklook': feature.properties['quicklook'],
                            'collection': feature.properties['collection'],
                            'services': {
                                'download': feature.properties['services'] ? feature.properties['services']['download'] : null
                            }
                        }
                    }
                ]),
                contentType: 'application/json'
            }).done(function (data) {
                if (data.ErrorCode && data.ErrorCode === 1000) {
                    $.growl.error({
                        title: Resto.Util.translate('_error'),
                        message: Resto.Util.translate('_itemAlreadyInCart')
                    });
                }
                else {
                    $.growl.notice({
                        title: Resto.Util.translate('_info'),
                        message: Resto.Util.translate('_itemAddedToCart')
                    });
                    for (var key in data.items) {
                        Resto.Header.userProfile.cart[key] = data.items[key];
                    }
                }
            }).fail(function (jqXHR, textStatus) {
                self.Util.dialog(Resto.Util.translate('_error'), textStatus);
            }).always(function() {
                self.Util.hideMask();
            });
        }
    };
    
    window.Resto.Header = {
        
        ssoServices: {},
        
        init: function() {
            
            var self = this;
            
            /*
             * Set Oauth servers
             */
            self.setOAuthServers();
            
            /*
             * Share on facebook
             */
            $('.shareOnFacebook').click(function(e) {
                e.preventDefault();
                window.open('https://www.facebook.com/sharer.php?u=' + encodeURIComponent(window.History.getState().cleanUrl) + '&t=' + encodeURIComponent($('#search')));
                return false;
            });

            /*
             * Share to twitter
             */
            $('.shareOnTwitter').click(function(e) {
                e.preventDefault();
                window.open('http://twitter.com/intent/tweet?status=' + encodeURIComponent($('#search') + " - " + window.History.getState().cleanUrl));
                return false;
            });

            /*
             * Show gravatar if user is connected
             */
            $('.gravatar').css('background-image', 'url(' + window.Resto.Util.getGravatar(self.userProfile.userhash, 200) + ')');
            
            /*
             * Sign in locally
             */
            $('.signIn').click(function(e) {
                e.preventDefault();
                self.signIn();
                return false;
            });
            
            /*
             * Register
             */
            $('.register').click(function(e){
                e.preventDefault();
                self.signUp();
                return false;
            });
            
            /*
             * Collection info trigger
             */
            $('.resto-collection-info-trigger').click(function(e){
                e.preventDefault();
                if ($('.resto-collection-info').is(':visible')) {
                    $('.resto-collection-info').slideUp();
                    $(this).removeClass('active');
                }
                else {
                    $('.resto-collection-info').slideDown();
                    $(this).addClass('active');
                }
                return false;
            });
            
            /*
             * Events
             */
            $('#userPassword').keypress(function (e) {
                if (e.which === 13) {
                    $('.signIn').trigger('click');
                    return false;
                }
            });
            $('#userPassword1').keypress(function (e) {
                if (e.which === 13) {
                    $('.register').trigger('click');
                    return false;
                }
            });
            
            $(document).on('opened.fndtn.reveal', '[data-reveal]', function (e) {
                
                $('body').css('overflow', 'hidden');
                
                /*
                 * Workaround to foundation bug in reveal
                 * (see https://github.com/zurb/foundation/issues/5482)
                 */
                if (e.namespace !== 'fndtn.reveal') {
                    return;
                }
                
                /*
                 * Remove focus from search
                 */
                if ($('#search').is(':focus')) {
                    $('#search').blur();
                }
                
                switch($(this).attr('id')) {
                    case 'displayRegister':
                        if (!Resto.Util.isMobile()) {
                            $('#userName').focus();
                        }
                        break;
                    case 'displayLogin':
                        if (!Resto.Util.isMobile()) {
                            $('#userEmail').focus();
                        }
                        break;
                    case 'displayProfile':
                        self.showProfile();
                        break;
                    case 'displayCart':
                        self.showCart();
                        break;
                    default:
                        break;
                }
            });
            
            $(document).on('close.fndtn.reveal', '[data-reveal]', function (e) {
                /*
                 * Workaround to foundation bug in reveal
                 * (see https://github.com/zurb/foundation/issues/5482)
                 */
                if (e.namespace !== 'fndtn.reveal') {
                    return;
                }
                
                /*
                 * Set focus on search
                 */
                if (!Resto.Util.isMobile()) {
                    $('#search').focus();
                }
                
                $('body').css('overflow', 'auto');
                
            });
            
            /*
             * Show small menu
             */
            $('.show-small-menu').click(function(e){
                e.preventDefault();
                if ($('#small-menu').is(':visible')){
                    $('#small-menu').hide();
                    $('.show-small-menu').removeClass('icon-close');
                    $('.show-small-menu').addClass('icon-menu');
                }else{
                    $('#small-menu').show();
                    $('.show-small-menu').addClass('icon-close');
                    $('.show-small-menu').removeClass('icon-menu');
                }
                return false;
            });
            
            $(window).resize(function(){
                $('#small-menu').hide();
            });
            
        },
     
        /**
         * Sign in
         */
        signIn: function() {
            Resto.Util.showMask();
            $.ajax({
                url: Resto.restoUrl + 'api/users/connect',
                headers: {
                    'Authorization': "Basic " + btoa($('#userEmail').val() + ":" + $('#userPassword').val())
                },
                dataType: 'json',
                cache:false
            }).done(function(data) {
                if (data && data.userid === -1) {
                    Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_wrongPassword'));
                }
                else {
                    window.location.reload();
                }
            }).error(function () {
                Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_cannotSignIn'));
            }).always(function(){
                Resto.Util.hideMask();
            });
        },
        
        /**
         * Register
         */
        signUp: function() {
            var username = $('#userName').val(), 
                password1 = $('#userPassword1').val(),
                email = $('#r_userEmail').val(),
                $div = $('#displayRegister');

            if (!email || !Resto.Util.isEmailAdress(email)) {
                Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_invalidEmail'));
            }
            else if (!username) {
                Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_usernameIsMandatory'));
            }
            else if (!password1) {
                Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_passwordIsMandatory'));
            }
            else {
                Resto.Util.showMask();
                $.ajax({
                    url: Resto.restoUrl + 'users',
                    type: 'POST',
                    dataType: "json",
                    data: {
                        email: email,
                        password: password1,
                        username: username,
                        givenname: $('#firstName').val(),
                        lastname: $('#lastName').val()
                    }
                }).done(function (data) {
                    if (data && data.status === 'success') {
                        Resto.Util.dialog(Resto.Util.translate('_info'), Resto.Util.translate('_emailSent'));
                        $div.hide();
                    }
                    else {
                        Resto.Util.dialog(Resto.Util.translate('_error'), data.ErrorMessage);
                    }
                }).fail(function (jqXHR, textStatus) {
                    if (e.responseJSON) {
                        Resto.Util.dialog(Resto.Util.translate('_error'), textStatus);
                    }
                    else {
                        Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_registrationFailed'));
                    }
                }).always(function() {
                    Resto.Util.hideMask();
                });
            }
        },
        
        /**
         * Show user profile
         */
        showProfile: function() {
            var $div = $('#displayProfile');
            $div.html('<div class="padded large-12 columns center"><img class="gravatar-big" src="' + window.Resto.Util.getGravatar(this.userProfile.userhash, 200) + '"/><a class="button signOut">' + window.Resto.Util.translate('_logout') + '</a></div><a class="close-reveal-modal">&#215;</a>');
            $('.signOut').click(function() {
                Resto.Util.showMask();
                $.ajax({
                    url: window.Resto.restoUrl + 'api/users/disconnect',
                    dataType:'json',
                    cache:false
                }).done(function(data) {
                    window.location.reload();
                }).fail(function() {
                    Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_disconnectFailed'));
                }).always(function() {
                    Resto.Util.hideMask();
                });
                return false;
            });
        },
        
        /**
         * Show user profile
         */
        showCart: function() {
            var self = this, $div = $('#displayCart .resto-cart-content');
            if (self.userProfile.cart) {
                var content = [];
                for (var key in self.userProfile.cart) {
                    if (self.userProfile.cart[key]['properties']) {
                        content.push('<tr><td><img src="' + (self.userProfile.cart[key]['properties']['quicklook'] ? self.userProfile.cart[key]['properties']['quicklook'] : '') + '"/></td><td>' + self.userProfile.cart[key]['properties']['collection'] + '</td><td><a href="'+ Resto.restoUrl + 'collections/' + self.userProfile.cart[key]['properties']['collection'] + '/' + self.userProfile.cart[key]['id'] + '.html" target="_blank">' + self.userProfile.cart[key]['id'] + '</a></td></tr>');
                    }
                }
                if (content.length > 0) {
                    $div.html('<table>' + content.join('') + '</table><div class="padded"><a class="button signIn placeOrder">' + Resto.Util.translate('_placeOrder') + '</div>');
                }
                else {
                    $div.html('<h2 class="text-dark center small">' + Resto.Util.translate('_cartIsEmpty') + '</h2>');
                }
            }
            $('.placeOrder').click(function() {
                Resto.Util.showMask();
                $.ajax({
                    url: window.Resto.restoUrl + 'users/' + self.userProfile['userid'] + '/orders.json',
                    type: 'POST',
                    dataType:'json'
                }).done(function(data) {
                    self.userProfile.cart = [];
                    $('#displayCart').foundation('reveal', 'close');
                    if (data['order']) {
                        window.Resto.download(window.Resto.restoUrl + 'users/' + self.userProfile['userid'] + '/orders/' + data['order']['orderId'] + '.meta4');
                    }
                }).fail(function() {
                    Resto.Util.dialog(Resto.Util.translate('_error'), Resto.Util.translate('_orderFailed'));
                }).always(function() {
                    Resto.Util.hideMask();
                });
                return false;
            });
        },
        
        /**
         * Open "Sign license popup" and start downloading product
         * if needed
         * 
         * @param {string} licenseUrl : license url
         * @param {string} collection : collection name
         * @param {string} url : target download url
         */
        signLicense: function(licenseUrl, collection, url) {
            var self = this;
            $('#dialog').html('<div class="padded center"><h2>' + Resto.Util.translate('_info') + '</h2><p class="text-dark">' + Resto.Util.translate('_termsOfLicense', [licenseUrl, collection]) + '</p><p class="center"><a href="#" class="center button signLicense">' + Resto.Util.translate('_iAgree') + '</a></p><a class="text-dark close-reveal-modal">&#215;</a></div>').foundation('reveal', 'open');
            $('#dialog .signLicense').click(function(){
                Resto.Util.showMask();
                $.ajax({
                    type: 'POST',
                    dataType: 'json',
                    data:collection,
                    url: Resto.restoUrl + 'api/users/' + self.userProfile['userid'] + '/signLicense.json'
                }).done(function (data) {
                    Resto.download(url);
                }).fail(function (jqXHR, textStatus) {
                    Resto.Util.dialog(Resto.Util.translate('_error'), textStatus);
                }).always(function () {
                    Resto.ajaxReady = true;                   
                    Resto.Util.hideMask();
                    $('#dialog').foundation('reveal', 'close');
                });
            });
        },
        
        /**
         * OAuth (e.g. google)
         */
        setOAuthServers: function () {
            var self = this;
            for (var key in self.ssoServices) {
                (function (key) {
                    $('.signWithOauth').append('<span id="_oauth' + key + '">' + self.ssoServices[key].button + '</span>');
                    $('a', '#_oauth' + key).click(function (e) {
                        
                        e.preventDefault();
                        e.stopPropagation();
                        
                        /*
                         * Open SSO authentication window
                         */
                        Resto.Util.showMask();
                        var popup = Resto.Util.popupwindow(self.ssoServices[key].authorizeUrl, "oauth", 400, $(window).height());
                        
                        /*
                         * Load user profile after popup has been closed
                         */
                        var fct = setInterval(function () {
                            if (popup.closed) {
                                clearInterval(fct);
                                window.location.reload();
                            }
                        }, 200);
                        return false;
                    });
                })(key);
            }
        }
    };

})(window);
