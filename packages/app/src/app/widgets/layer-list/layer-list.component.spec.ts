import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerListComponent } from './layer-list.component';

describe('LayerListComponent', () => {
  let component: LayerListComponent;
  let fixture: ComponentFixture<LayerListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayerListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
